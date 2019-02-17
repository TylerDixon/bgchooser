package bggclient

import (
	"encoding/xml"
	"io/ioutil"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	log "github.com/Sirupsen/logrus"

	"github.com/pkg/errors"
)

type collectionRes struct {
	Games []Game `xml:"item"`
}

type Game struct {
	ID        string   `xml:"objectid,attr" json:"id"`
	Name      string   `xml:"name" json:"name"`
	Thumbnail string   `xml:"thumbnail" json:"thumbnail"`
	Info      GameInfo `xml:"stats" json:"info"`
}

type GameInfo struct {
	MinPlayers  int `xml:"minplayers,attr" json:"minPlayers"`
	MaxPlayers  int `xml:"maxplayers,attr" json:"maxPlayers"`
	MinPlaytime int `xml:"minplaytime,attr" json:"minPlaytime"`
	MaxPlaytime int `xml:"maxplaytime,attr" json:"maxPlaytime"`
}

type getGameRes struct {
	Items []singleGame `xml:"item"`
}

type singleGame struct {
	ID          string      `xml:"id,attr" json:"id"`
	Thumbnail   string      `xml:"thumbnail" json:"thumbnail"`
	Name        []valueAttr `xml:"name" json:"name"`
	MinPlayers  valueAttr   `xml:"minplayers" json:"minPlayers"`
	MaxPlayers  valueAttr   `xml:"maxplayers" json:"maxPlayers"`
	MinPlaytime valueAttr   `xml:"minplaytime" json:"minPlaytime"`
	MaxPlaytime valueAttr   `xml:"maxplaytime" json:"maxPlaytime"`
}

type valueAttr struct {
	Value string `xml:"value,attr"`
	Type  string `xml:"type,attr"`
}

func GetGameInfo(gameID string) (Game, error) {
	reqString := "https://boardgamegeek.com/xmlapi2/thing?type=boardgame&id=" + url.QueryEscape(gameID)
	res, err := http.Get(reqString)
	if err != nil {
		return Game{}, err
	}
	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		return Game{}, err
	}

	var gameRes getGameRes
	err = xml.Unmarshal(body, &gameRes)
	if len(gameRes.Items) == 0 {
		return Game{}, errors.New("Failed to find game of ID: " + gameID)
	}
	game := Game{
		ID:        gameRes.Items[0].ID,
		Thumbnail: gameRes.Items[0].Thumbnail,
		Info:      GameInfo{},
	}

	i, err := strconv.Atoi(gameRes.Items[0].MaxPlayers.Value)
	if err == nil {
		game.Info.MaxPlayers = i
	}

	i, err = strconv.Atoi(gameRes.Items[0].MinPlayers.Value)
	if err == nil {
		game.Info.MinPlayers = i
	}

	i, err = strconv.Atoi(gameRes.Items[0].MaxPlaytime.Value)
	if err == nil {
		game.Info.MaxPlaytime = i
	}

	i, err = strconv.Atoi(gameRes.Items[0].MinPlaytime.Value)
	if err == nil {
		game.Info.MinPlaytime = i
	}

	for _, name := range gameRes.Items[0].Name {
		if name.Type == "primary" {
			game.Name = name.Value
		}
	}

	return game, err

}

func GetUserCollection(userID string, r *http.Request) ([]Game, error) {
	var res *http.Response
	var err error
	var wg sync.WaitGroup
	wg.Add(1)
	numRetries := 0

	go func() {
		defer wg.Done()
		reqString := "https://boardgamegeek.com/xmlapi2/collection?username=" + url.QueryEscape(userID) + "&own=1&excludesubtype=boardgameexpansion&stats=1&wishlist=0"

		// Forward the `X-Forwarded-For` header, since (I believe) this is what the
		// BGG XML API uses to rate limit users. Without this, all requests coming from this
		// server are subject to the same rate limiting. IMO, this should instead be relative
		// to the user's making the request. I would instead do this from the browser
		// if the API didn't have weird CORs shenanigans on non-200 responses.
		client := &http.Client{}
		var req *http.Request
		req, err = http.NewRequest("GET", reqString, nil)
		if err != nil {
			log.Error(log.Fields{"userID": userID}, "Failed to create request for user")
			return
		}
		req.Header.Add("X-Forwarded-For", r.Header.Get("X-Forwarded-For"))
		res, err = client.Do(req)
		for res.StatusCode == 202 && err == nil && numRetries < 10 {
			numRetries++
			time.Sleep(time.Second)
			res, err = http.Get(reqString)
			if res.StatusCode == 202 {
				err = nil
			}
		}
		if numRetries >= 10 {
			err = errors.New("exceeded number of retries")
		}
	}()
	wg.Wait()

	if err != nil {
		return []Game{}, err
	} else if res.StatusCode != 200 {
		body, err := ioutil.ReadAll(res.Body)
		if err != nil {
			return []Game{}, err
		}
		return []Game{}, errors.New("non-200 received from bgg: " + string(body))
	}

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		return []Game{}, err
	}

	var collRes collectionRes
	err = xml.Unmarshal(body, &collRes)

	return collRes.Games, err
}
