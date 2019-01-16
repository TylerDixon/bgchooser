package api

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"math/rand"
	"net/http"

	"github.com/gorilla/mux"
	"github.com/tylerdixon/bgchooser/bggclient"
	"github.com/tylerdixon/bgchooser/storage"
	socketio "gopkg.in/googollee/go-socket.io.v1"
)

type API struct {
	SocketServer *socketio.Server
	Router       *mux.Router
	Storage      storage.Storage
}

type ConnectionContext struct {
	Close func() error
}

func New() API {
	api := API{}
	stor, err := storage.New()
	if err != nil {
		log.Fatal(err)
		panic(err.Error())
	}
	api.Storage = stor

	socketServer, err := api.newSocketServer()
	if err != nil {
		log.Fatal(err)
		panic(err.Error())
	}

	api.SocketServer = socketServer
	api.Router = mux.NewRouter()

	http.Handle("/socket.io/", socketServer)
	api.Router.HandleFunc("/rooms", NewRoom).Methods("POST")
	api.Router.HandleFunc("/rooms/{ roomID }", api.GetRoomInfo).Methods("GET")
	api.Router.HandleFunc("/rooms/{ roomID }/add/{ bggUserID }", api.AddBggUser).Methods("GET")
	api.Router.HandleFunc("/rooms/{ roomID }/vote/{ user }", api.AddBggUser).Methods("POST")
	return api
}

func (a *API) Start(port string) error {
	return http.ListenAndServe(port, a.Router)
}

func NewRoom(w http.ResponseWriter, r *http.Request) {
	id := fmt.Sprintf("%5d", rand.Intn(99999))
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(id))
}

func (a *API) AddBggUser(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	roomID := vars["roomID"]
	bggUserID := vars["bggUserID"]
	games, err := bggclient.GetUserCollection(bggUserID)

	if err != nil {
		// TODO: What status code?
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error()))
		return
	}

	err = a.Storage.AddGamesToRoom(roomID, bggUserID, games)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		// TODO: Scrub error
		w.Write([]byte(err.Error()))
		return
	}

	w.WriteHeader(http.StatusOK)
	// TODO: return new games and alert users of games added
}

type GetRoomInfoRes struct {
	Games []string           `json:"games"`
	Votes storage.VoteResult `json:"votes"`
}

func (a *API) GetRoomInfo(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	roomID := vars["roomID"]
	games, err := a.Storage.GetGamesForRoom(roomID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("failed to get games for room: " + err.Error()))
		return
	}

	votes, err := a.Storage.GetUserVotes(roomID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("failed to get votes for room: " + err.Error()))
		return
	}

	res := GetRoomInfoRes{
		Games: games,
		Votes: votes,
	}

	resBody, err := json.Marshal(res)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("failed to marshal response for get room: " + err.Error()))
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write(resBody)
}

type AddVotesToRoomBody struct {
	Votes  []string `json:"votes"`
	Vetoes []string `json:"vetoes"`
}

func (a *API) AddVotesToRoom(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	roomID := vars["roomID"]
	userID := vars["userID"]
	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("failed to read body from request: " + err.Error()))
		return
	}
	var votes AddVotesToRoomBody
	err = json.Unmarshal(body, &votes)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte("failed to unmarshal body: " + err.Error()))
		return
	}

	err = a.Storage.AddUserVotes(roomID, userID, votes.Votes, votes.Vetoes)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("failed to write votes to storage: " + err.Error()))
		return
	}

	w.WriteHeader(http.StatusOK)
	// TODO: notify users of new votes
}

func (api *API) newSocketServer() (*socketio.Server, error) {
	server, err := socketio.NewServer(nil)
	if err != nil {
		return nil, err
	}
	server.OnConnect("/", func(s socketio.Conn) error {
		fmt.Println("connected:", s.ID())
		return nil
	})
	server.OnEvent("/", "register", func(s socketio.Conn, msg string) {
		var ctx ConnectionContext
		ctx.Close = api.Storage.SubscribeToRoomInfo(msg, func(msg storage.RoomSubscriptionMessage) {
			s.Emit(string(msg.Type), msg.Message)
		})
		s.SetContext(ctx)
	})
	server.OnEvent("/", "disconnect", func(s socketio.Conn) {
		s.Close()
	})
	server.OnError("/", func(e error) {
		//TODO: err
		fmt.Println("meet error:", e)
	})
	server.OnDisconnect("/", func(s socketio.Conn, msg string) {
		//TODO: Is this called on socket connection close?
		ctx := s.Context().(ConnectionContext)
		if ctx.Close() != nil {
			//TODO: Actually figure out logging with errors
			log.Println("Failed to close subscription: " + err.Error())
		}
	})
	go server.Serve()
	return server, err
}
