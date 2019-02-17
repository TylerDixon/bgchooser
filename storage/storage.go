package storage

import (
	"encoding/json"
	"errors"
	"flag"
	"strings"
	"time"

	log "github.com/Sirupsen/logrus"
	"github.com/go-redis/redis"
	"github.com/tylerdixon/bgchooser/bggclient"
)

const itemSep = ";;"

// UpdateType represents a specific type of update for room subscriptions
type UpdateType string

const (
	UpdateTypeAddedGames UpdateType = "addedGamesUpdate"
	UpdateTypeAddedVotes            = "addedVotesUpdate"
	UpdateTypeResetVotes            = "resetVotesUpdate"
)

type Storage struct {
	redisClient *redis.Client
}

var redisAddr string

const roomTTL = time.Hour * 24 * 14

func init() {
	flag.StringVar(&redisAddr, "redis-addr", "localhost:6379", "Address to access redis by")
}

// New creates a new instance of Storage
func New() (Storage, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     redisAddr,
		Password: "", // no password set
		DB:       0,  // use default DB
	})

	_, err := client.Ping().Result()
	return Storage{
		redisClient: client,
	}, err
}

// SetExpire sets the expiration for all entries related to a roomID
func (s *Storage) SetExpire(roomID string) {
	s.expire("games:" + roomID)
	s.expire("rooms:" + roomID)
}

func (s *Storage) expire(key string) {
	cmd := s.redisClient.Expire(key, roomTTL)

	res, err := cmd.Result()

	// No need to return error, as setting the expiration isn't critical
	if err != nil {
		log.Error(log.Fields{"key": key, "err": err}, "Failed to set expire on room due to error")
	} else if !res {
		log.Error(log.Fields{"key": key}, "Expire not set on room")
	}
}

// AddGamesToRoom takes a adds an hash a set of games to a hash keyed by the user
func (s *Storage) AddGamesToRoom(roomID, bggUser string, games []bggclient.Game) error {
	getGamesCmd := s.redisClient.HGet("games:"+roomID, bggUser)
	getGamesRes, err := getGamesCmd.Result()
	if err != nil && err != redis.Nil {
		return err
	}
	var currentGames []bggclient.Game
	err = json.Unmarshal([]byte(getGamesRes), &currentGames)
	for _, game := range games {
		currentGames = append(currentGames, game)
	}
	gamesToStore, err := json.Marshal(currentGames)
	if err != nil {
		return err
	}
	cmd := s.redisClient.HSet("games:"+roomID, bggUser, gamesToStore)
	err = cmd.Err()
	if err != nil {
		return err
	}
	go s.SetExpire(roomID)
	// TODO: Maybe should only log error on publish fail?
	pubCmd := s.redisClient.Publish("room:"+roomID, string(UpdateTypeAddedGames)+"::"+bggUser+"::"+string(gamesToStore))
	return pubCmd.Err()
}

// GetGamesForRom retrieves all of the games for a room
func (s *Storage) GetGamesForRoom(roomID string) ([]bggclient.Game, error) {
	cmd := s.redisClient.HGetAll("games:" + roomID)
	res, err := cmd.Result()
	if err != nil {
		return []bggclient.Game{}, err
	}
	go s.SetExpire(roomID)
	var gamesToReturn []bggclient.Game
	for _, gamesList := range res {
		var games []bggclient.Game
		err := json.Unmarshal([]byte(gamesList), &games)
		if err != nil {
			return gamesToReturn, err
		}
		gamesToReturn = append(gamesToReturn, games...)
	}
	return gamesToReturn, nil
}

// SetUserVotes sets the votes and vetoes for a user
func (s *Storage) SetUserVotes(roomID, user string, votes, vetoes []string) error {
	votesString := strings.Join(votes, itemSep)
	vetoesString := strings.Join(vetoes, itemSep)
	cmd := s.redisClient.HSet("rooms:"+roomID, user, votesString+"::"+vetoesString)
	err := cmd.Err()
	if err != nil {
		return err
	}
	go s.SetExpire(roomID)

	pubCmd := s.redisClient.Publish("room:"+roomID, UpdateTypeAddedVotes+"::"+user+"::"+votesString+"::"+vetoesString)
	return pubCmd.Err()
}

// VoteResult represents a map of user ID to a list of games they voted for
type VoteResult struct {
	Votes  map[string][]string `json:"votes"`
	Vetoes map[string][]string `json:"vetoes"`
}

// GetUserVotes returns a the vote result for a user
func (s *Storage) GetUserVotes(roomID string) (VoteResult, error) {
	var voteRes VoteResult
	cmd := s.redisClient.HGetAll("rooms:" + roomID)
	res, err := cmd.Result()
	if err != nil {
		return voteRes, err
	}

	voteRes.Votes = make(map[string][]string)
	voteRes.Vetoes = make(map[string][]string)
	for user, v := range res {
		split := strings.Split(v, "::")
		if len(split) != 2 {
			return voteRes, errors.New("Failed to split following string with \"::\": " + v)
		}
		votes := strings.Split(split[0], itemSep)
		voteRes.Votes[user] = votes
		vetoes := strings.Split(split[1], itemSep)
		voteRes.Vetoes[user] = vetoes
	}

	return voteRes, nil
}

// ResetRoomVotes removes all current votes for a room
func (s *Storage) ResetRoomVotes(roomID string) error {
	cmd := s.redisClient.Del("rooms:" + roomID)
	err := cmd.Err()
	if err != nil {
		return err
	}

	pubCmd := s.redisClient.Publish("room:"+roomID, UpdateTypeResetVotes)
	return pubCmd.Err()
}

// RoomSubscriptionMessage represents a message for when a room is updated
type RoomSubscriptionMessage struct {
	Type   UpdateType       `json:"type"`
	Games  []bggclient.Game `json:"games"`
	Votes  []string         `json:"votes"`
	Vetoes []string         `json:"vetoes"`
	User   string           `json:"user"`
}

// SubscribeToRoomInfo sets up a subscription to updates for a room, calling the watchFn whenever an update is published
func (s *Storage) SubscribeToRoomInfo(roomID string, watchFn func(RoomSubscriptionMessage)) func() error {
	pubsub := s.redisClient.Subscribe("room:" + roomID)
	channel := pubsub.Channel()
	go func() {
		for {
			msg := <-channel
			if msg == nil {
				return
			}
			// TODO: Validate parts
			parts := strings.Split(msg.Payload, "::")
			if len(parts) == 0 {
				log.Println("Error, malformed pubsub message: " + msg.Payload)
				return
			}
			switch UpdateType(parts[0]) {
			case UpdateTypeAddedGames:
				if len(parts) != 3 {
					log.Println("Error, malformed pubsub added games message: " + msg.Payload)
				}
				var games []bggclient.Game
				err := json.Unmarshal([]byte(parts[2]), &games)
				if err != nil {
					log.Println("Error, malformed games in added games message: " + msg.Payload)
				}
				watchFn(RoomSubscriptionMessage{
					Type:  UpdateType(parts[0]),
					User:  parts[1],
					Games: games,
				})
			case UpdateTypeAddedVotes:
				if len(parts) != 4 {
					log.Println("Error, malformed pubsub added votes message: " + msg.Payload)
				}
				watchFn(RoomSubscriptionMessage{
					Type:   UpdateType(parts[0]),
					User:   parts[1],
					Votes:  strings.Split(parts[2], itemSep),
					Vetoes: strings.Split(parts[3], itemSep),
				})
			case UpdateTypeResetVotes:
				watchFn(RoomSubscriptionMessage{
					Type: UpdateType(parts[0]),
				})
			}
		}
	}()

	return func() error {
		return pubsub.Close()
	}
}
