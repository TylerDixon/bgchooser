package api

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"io/ioutil"
	"math/rand"
	"net"
	"net/http"
	"strings"
	"time"

	log "github.com/Sirupsen/logrus"

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

var randRunes = []rune("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")

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

	api.Router = mux.NewRouter().PathPrefix("/api").Subrouter().StrictSlash(false)

	api.Router.PathPrefix("/static/").Handler(http.StripPrefix("/static/", http.FileServer(http.Dir("./build/static/"))))
	api.Router.Use(mux.MiddlewareFunc(func(h http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {

			entry := log.NewEntry(log.StandardLogger())
			start := time.Now()

			if reqID := r.Header.Get("X-Request-Id"); reqID != "" {
				entry = entry.WithField("requestId", reqID)
			}

			entry = entry.WithField("remoteAddr", r.RemoteAddr)
			if ff := r.Header.Get("X-Forwarded-For"); ff != "" {
				entry = entry.WithField("remoteAddr", ff)
			}
			if rip := r.Header.Get("X-Real-IP"); rip != "" {
				entry = entry.WithField("remoteAddr", net.ParseIP(rip).String())
			}

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
	api.Router.HandleFunc("/init", api.socketInit)
	api.Router.HandleFunc("/rooms", NewRoom).Methods("POST")
	api.Router.HandleFunc("/rooms/{roomID}", api.GetRoomInfo).Methods("GET")
	api.Router.HandleFunc("/rooms/{roomID}/bgguser/{bggUserID}", api.getBggUser).Methods("GET")
	api.Router.HandleFunc("/rooms/{roomID}/bgguser/{bggUserID}", api.addBggUser).Methods("POST")
	api.Router.HandleFunc("/rooms/{roomID}/vote/reset", api.resetVotes).Methods("POST")
	api.Router.HandleFunc("/rooms/{roomID}/vote/{userID}", api.addVotesToRoom).Methods("POST")
	api.Router.HandleFunc("/rooms/{roomID}/games/{userID}/{gameID}", api.addGame).Methods("POST")
	api.Router.PathPrefix("/").HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "./build/index.html")
	})
	return api
}

func (api *API) socketInit(w http.ResponseWriter, r *http.Request) {
	c, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Print("upgrade:", err)
		return
	}
	defer c.Close()
	mt, message, err := c.ReadMessage()
	splitMsg := strings.Split(string(message), ":")
	if len(splitMsg) < 2 {
		log.Error(log.Fields{"socketMsg": string(message)}, "Malformed message received in socket init")
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	roomID := splitMsg[1]
	close := api.Storage.SubscribeToRoomInfo(roomID, func(msg storage.RoomSubscriptionMessage) {
		log.Info(log.Fields{"roomID": roomID, "msgType": msg.Type}, "Socket event sent")
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

// Start begins the api listening on the given port
func (a *API) Start(port string) error {
	log.Println("Listening on port " + port)
	return http.ListenAndServe(port, a.Router)
}

type NewRoomRes struct {
	RoomID string `json:"roomID"`
}

func NewRoom(w http.ResponseWriter, r *http.Request) {
	b := make([]rune, 10)
	for i := range b {
		b[i] = randRunes[rand.Intn(len(randRunes))]
	}
	res := NewRoomRes{
		RoomID: string(b),
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

func (a *API) getBggUser(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	roomID := vars["roomID"]
	bggUserID := vars["bggUserID"]

	games, err := bggclient.GetUserCollection(bggUserID, r)

	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		// TODO: Scrub error?
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

func (a *API) addBggUser(w http.ResponseWriter, r *http.Request) {
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

type addVotesToRoomBody struct {
	Votes  []string `json:"votes"`
	Vetoes []string `json:"vetoes"`
}

func (a *API) addVotesToRoom(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	roomID := vars["roomID"]
	userID := vars["userID"]
	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("failed to read body from request: " + err.Error()))
		return
	}
	var votes addVotesToRoomBody
	err = json.Unmarshal(body, &votes)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte("failed to unmarshal body: " + err.Error()))
		return
	}

	err = a.Storage.SetUserVotes(roomID, userID, votes.Votes, votes.Vetoes)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("failed to write votes to storage: " + err.Error()))
		return
	}

	w.WriteHeader(http.StatusOK)
	// TODO: notify users of new votes
}

func (a *API) resetVotes(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	roomID := vars["roomID"]
	err := a.Storage.ResetRoomVotes(roomID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("failed to reset votes in storage: " + err.Error()))
		return
	}

	w.WriteHeader(http.StatusOK)
}

type addGameRes struct {
	Game bggclient.Game `json:"game"`
}

func (a *API) addGame(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	roomID := vars["roomID"]
	gameID := vars["gameID"]
	userID := vars["userID"]

	game, err := bggclient.GetGameInfo(gameID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("Failed to get game info from BGG: " + err.Error()))
		return
	}

	err = a.Storage.AddGamesToRoom(roomID, userID, []bggclient.Game{game})
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("failed to add game to room: " + err.Error()))
		return
	}

	resBody, err := json.Marshal(addGameRes{game})
	if err != nil {
		log.Error(log.Fields{
			"roomID": roomID,
		}, err)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("failed to marshal response for adding game to room: " + err.Error()))
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write(resBody)
}
