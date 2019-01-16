package storage

import (
	"errors"
	"flag"
	"log"
	"strings"

	"github.com/go-redis/redis"
)

const itemSep = ";;"

type UpdateType string

const (
	UpdateTypeAddedGames UpdateType = "addedGamesUpdate"
	UpdateTypeAddedVotes            = "addedVotesUpdate"
)

type Storage struct {
	redisClient *redis.Client
}

var redisAddr string

func init() {
	flag.StringVar(&redisAddr, "redis-addr", "localhost:6379", "Address to access redis by")
}

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

// type Room struct {
// 	BGGUsers string `json:"bggUsers"`
// 	BgList   string `json:"bgList"`
// 	NumUsers int    `json:"numUsers"`
// }

// func (s *Storage) GetRoomInfo(roomID string) (Room, error) {
// 	room := Room{}
// 	cmd := s.redisClient.HGetAll(roomID)
// 	res, err := cmd.Result()
// 	if err != nil {
// 		return room, err
// 	}

// 	err = mapstructure.Decode(res, &room)
// 	return room, err
// }

func (s *Storage) AddGamesToRoom(roomID, bggUser string, games []string) error {
	gamesString := strings.Join(games, itemSep)
	cmd := s.redisClient.HSet("games:"+roomID, bggUser, gamesString)
	err := cmd.Err()
	if err != nil {
		return err
	}
	pubCmd := s.redisClient.Publish(roomID, string(UpdateTypeAddedGames)+":"+bggUser+":"+gamesString)
	return pubCmd.Err()
}

func (s *Storage) GetGamesForRoom(roomID string) ([]string, error) {
	cmd := s.redisClient.HGetAll("games:" + roomID)
	res, err := cmd.Result()
	if err != nil {
		return []string{}, err
	}
	var games []string
	for _, gamesList := range res {
		games = append(games, strings.Split(gamesList, itemSep)...)
	}
	return games, nil
}

func (s *Storage) AddUserVotes(roomID, user string, votes, vetoes []string) error {
	votesString := strings.Join(votes, itemSep)
	vetoesString := strings.Join(vetoes, itemSep)
	cmd := s.redisClient.HSet("rooms:"+roomID, user, votesString+"::"+vetoesString)
	err := cmd.Err()
	if err != nil {
		return err
	}

	pubCmd := s.redisClient.Publish(roomID, UpdateTypeAddedVotes+":"+user+":"+votesString+":"+vetoesString)
	return pubCmd.Err()
}

type VoteResult struct {
	Votes  map[string]int
	Vetoes map[string]int
}

func (s *Storage) GetUserVotes(roomID string) (VoteResult, error) {
	var voteRes VoteResult
	cmd := s.redisClient.HGetAll("rooms:" + roomID)
	res, err := cmd.Result()
	if err != nil {
		return voteRes, err
	}

	for _, v := range res {
		split := strings.Split(v, "::")
		if len(split) != 2 {
			return voteRes, errors.New("Failed to split following string with \"::\": " + v)
		}
		votes := strings.Split(split[0], itemSep)
		for _, game := range votes {
			if _, ok := voteRes.Votes[game]; !ok {
				voteRes.Votes[game] = 0
			}
			voteRes.Votes[game]++
		}
		vetoes := strings.Split(split[1], itemSep)
		for _, game := range vetoes {
			if _, ok := voteRes.Vetoes[game]; !ok {
				voteRes.Vetoes[game] = 0
			}
			voteRes.Vetoes[game]++
		}
	}

	return voteRes, nil
}

type RoomSubscriptionMessage struct {
	Type   UpdateType
	Games  []string
	Votes  []string
	Vetoes []string
	User   string
}

func (s *Storage) SubscribeToRoomInfo(roomID string, watchFn func(RoomSubscriptionMessage)) func() error {
	pubsub := s.redisClient.Subscribe("room:" + roomID)
	channel := pubsub.Channel()
	go func() {
		for {
			msg := <-channel
			// TODO: Validate parts
			parts := strings.Split(msg.Payload, ":")
			if len(parts) == 0 {
				log.Println("Error, malformed pubsub message: " + msg.Payload)
				return
			}
			switch UpdateType(parts[0]) {
			case UpdateTypeAddedGames:
				if len(parts) != 3 {
					log.Println("Error, malformed pubsub added games message: " + msg.Payload)
				}
				watchFn(RoomSubscriptionMessage{
					Type:  UpdateType(parts[0]),
					User:  parts[1],
					Games: strings.Split(parts[2], itemSep),
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
			}
		}
	}()

	return func() error {
		return pubsub.Close()
	}
}
