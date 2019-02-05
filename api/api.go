package api

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/ioutil"
	"math/rand"
	"net"
	"net/http"
	"strings"
	"time"

	log "github.com/Sirupsen/logrus"

	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	"github.com/tylerdixon/bgchooser/bggclient"
	"github.com/tylerdixon/bgchooser/storage"
	socketio "gopkg.in/googollee/go-socket.io.v1"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
} // use default options

type API struct {
	SocketServer *socketio.Server
	Router       *mux.Router
	Storage      storage.Storage
}

type ConnectionContext struct {
	Close func() error
}

func init() {
	rand.Seed(time.Now().Unix())
}

type loggingResponseWriter struct {
	http.ResponseWriter
	w          io.Writer
	statusCode int
	body       []byte
}

func (w *loggingResponseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if hj, ok := w.w.(http.Hijacker); ok {
		return hj.Hijack()
	}
	return nil, nil, errors.New("chi/middleware: http.Hijacker is unavailable on the writer")
}

func newLoggingResponseWriter(w http.ResponseWriter) *loggingResponseWriter {
	return &loggingResponseWriter{w, w, http.StatusOK, []byte{}}
}

func (lw *loggingResponseWriter) WriteHeader(code int) {
	lw.statusCode = code
	lw.ResponseWriter.WriteHeader(code)
}

func (lw *loggingResponseWriter) Write(b []byte) (int, error) {
	lw.body = b
	return lw.ResponseWriter.Write(b)
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
	api.Router = mux.NewRouter().PathPrefix("/api").Subrouter().StrictSlash(false)

	echo := func(w http.ResponseWriter, r *http.Request) {
		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			log.Print("upgrade:", err)
			return
		}
		defer c.Close()
		mt, message, err := c.ReadMessage()
		// TODO: error if bad msg
		roomID := strings.Split(string(message), ":")[1]
		close := api.Storage.SubscribeToRoomInfo(roomID, func(msg storage.RoomSubscriptionMessage) {
			// TODO: return stuff
			returnMsg, err := json.Marshal(msg)
			if err != nil {
				log.Println("Failed to marshal games to emit to user: " + err.Error())
			}
			c.WriteMessage(mt, returnMsg)
		})
		defer close()
		shouldClose := false
		c.SetCloseHandler(func(code int, msg string) error {
			shouldClose = true
			close()
			return nil
		})
		for !shouldClose {
			_, _, err := c.ReadMessage()
			if err != nil {
				log.Println("socket err: " + err.Error())
				break
			}
		}
	}

	// fs := http.FileServer(http.Dir("build"))
	// api.Router.Handle("/", fs)
	// api.Router.Handle("/static/", http.FileServer(http.Dir("./build")))
	// api.Router.Handle("/static/css", http.FileServer(http.Dir("./build")))
	// Serve static files
	api.Router.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir("./build/static/"))))
	api.Router.Use(mux.MiddlewareFunc(func(h http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

			entry := log.NewEntry(log.StandardLogger())
			start := time.Now()

			if reqID := r.Header.Get("X-Request-Id"); reqID != "" {
				entry = entry.WithField("requestId", reqID)
			}

			entry = entry.WithField("remoteAddr", r.RemoteAddr)

			lw := newLoggingResponseWriter(w)
			h.ServeHTTP(lw, r)

			latency := time.Since(start)

			fields := log.Fields{
				"status": lw.statusCode,
				"took":   latency,
				"url":    r.RequestURI,
				"method": r.Method,
				"ua":     r.UserAgent(),
			}

			msg := "done"
			if lw.statusCode != http.StatusOK {
				fields["body"] = string(lw.body)
				msg = "err"
			}

			entry.WithFields(fields).Info(msg)
		})
	}))

	// Serve index page on all unhandled routes
	api.Router.HandleFunc("/echo", echo)
	api.Router.HandleFunc("/rooms", NewRoom).Methods("POST")
	api.Router.HandleFunc("/rooms/{roomID}", api.GetRoomInfo).Methods("GET")
	api.Router.HandleFunc("/rooms/{roomID}/bgguser/{bggUserID}", api.GetBggUser).Methods("GET")
	api.Router.HandleFunc("/rooms/{roomID}/bgguser/{bggUserID}", api.AddBggUser).Methods("POST")
	api.Router.HandleFunc("/rooms/{roomID}/vote/{userID}", api.AddVotesToRoom).Methods("POST")
	api.Router.PathPrefix("/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./build/index.html")
	})
	return api
}

func (a *API) Start(port string) error {
	log.Println("Listening on port " + port)
	return http.ListenAndServe(port, handlers.CORS(handlers.AllowCredentials(), handlers.AllowedOrigins([]string{"*"}))(a.Router))
}

type NewRoomRes struct {
	RoomID string `json:"roomID"`
}

func NewRoom(w http.ResponseWriter, r *http.Request) {
	id := fmt.Sprintf("%05d", rand.Intn(99999))
	res := NewRoomRes{
		RoomID: id,
	}
	byteRes, err := json.Marshal(res)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error()))
	}
	w.WriteHeader(http.StatusOK)
	w.Write(byteRes)
}

type BggUserGames struct {
	Games []bggclient.Game `json:"games"`
}

type AddGamesMessage struct {
	Progress float32        `json:"progress"`
	Game     bggclient.Game `json:"game"`
	Error    string         `json:"error"`
	NewGame  bool           `json:"newGame"`
}

func (a *API) GetBggUser(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	roomID := vars["roomID"]
	bggUserID := vars["bggUserID"]

	currentGames, err := a.Storage.GetGamesForRoom(roomID)
	if err != nil {
		log.Println("failed to get current games when adding bgg user, roomID: " + roomID)
	}

	games, err := bggclient.GetUserCollection(bggUserID, currentGames)

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		// TODO: Scrub error
		w.Write([]byte(err.Error()))
		return
	}

	res := BggUserGames{
		Games: games,
	}
	byteRes, err := json.Marshal(res)
	if err != nil {
		log.Error(log.Fields{
			"roomID":    roomID,
			"bggUserID": bggUserID,
		}, err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error()))
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write(byteRes)
}

func (a *API) AddBggUser(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	roomID := vars["roomID"]
	bggUserID := vars["bggUserID"]

	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		log.Error(log.Fields{
			"roomID":    roomID,
			"bggUserID": bggUserID,
		}, err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error()))
		return
	}

	var req BggUserGames
	err = json.Unmarshal(body, &req)
	if err != nil {
		log.Error(log.Fields{
			"roomID":    roomID,
			"bggUserID": bggUserID,
		}, err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error()))
		return
	}

	err = a.Storage.AddGamesToRoom(roomID, bggUserID, req.Games)
	if err != nil {
		log.Error(log.Fields{
			"roomID":    roomID,
			"bggUserID": bggUserID,
		}, err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(err.Error()))
		return
	}
	w.WriteHeader(http.StatusOK)
	w.Write(body)
}

type GetRoomInfoRes struct {
	Games       []bggclient.Game   `json:"games"`
	VoteResults storage.VoteResult `json:"voteResults"`
}

func (a *API) GetRoomInfo(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	roomID := vars["roomID"]
	games, err := a.Storage.GetGamesForRoom(roomID)
	if err != nil {
		log.Error(log.Fields{
			"roomID": roomID,
		}, err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("failed to get games for room: " + err.Error()))
		return
	}

	votes, err := a.Storage.GetUserVotes(roomID)
	if err != nil {
		log.Error(log.Fields{
			"roomID": roomID,
		}, err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("failed to get votes for room: " + err.Error()))
		return
	}

	res := GetRoomInfoRes{
		Games:       games,
		VoteResults: votes,
	}

	resBody, err := json.Marshal(res)
	if err != nil {
		log.Error(log.Fields{
			"roomID": roomID,
		}, err)
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
		log.Println(msg)
		log.Println("asdfasdf")
		var ctx ConnectionContext
		ctx.Close = api.Storage.SubscribeToRoomInfo(msg, func(msg storage.RoomSubscriptionMessage) {
			log.Println(msg)
			log.Println("asdfasdf2")
			// TODO: return stuff
			gamesToEmit, err := json.Marshal(msg.Games)
			if err != nil {
				log.Println("Failed to marshal games to emit to user: " + err.Error())
			}
			log.Println(string(msg.Type))
			s.Emit(string(msg.Type), msg.User, gamesToEmit)
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
