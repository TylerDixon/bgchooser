package bggclient

import (
	"encoding/xml"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/pkg/errors"
)

type collectionRes struct {
	Games []Game `xml:"item"`
}

type Game struct {
	ID        string   `xml:"objectid,attr" json:"id"`
	Name      string   `xml:"name" json:"name"`
	Thumbnail string   `xml:"thumbnail" json:"thumbnail"`
	Info      GameInfo `json:"info"`
}

type GameInfo struct {
	MinPlayers  int   `json:"minPlayers"`
	MaxPlayers  int   `json:"maxPlayers"`
	MinPlaytime int   `json:"minPlaytime"`
	MaxPlaytime int   `json:"maxPlaytime"`
	Tags        []Tag `json:"tags"`
}

type parsedGameInfo struct {
	MinPlayers  entryWithValue `xml:"item>minplayers"`
	MaxPlayers  entryWithValue `xml:"item>maxplayers"`
	MinPlaytime entryWithValue `xml:"item>minplaytime"`
	MaxPlaytime entryWithValue `xml:"item>maxplaytime"`
	Tags        []Tag          `xml:"item>link"`
}

type entryWithValue struct {
	Value int `xml:"value,attr"`
}

type Tag struct {
	ID    string `xml:"id,attr" json:"id"`
	Type  string `xml:"type,attr" json:"-"`
	Label string `xml:"value,attr" json:"label"`
}

func GetUserCollection(userID string) ([]Game, error) {
	var res *http.Response
	var err error
	var wg sync.WaitGroup
	wg.Add(1)
	numRetries := 0

	log.Println("asdf")
	log.Println(userID)
	go func() {
		defer wg.Done()
		log.Println("asdf")
		log.Println(userID)
		res, err = http.Get("https://boardgamegeek.com/xmlapi2/collection?username=" + url.QueryEscape(userID) + "&own=1&excludesubtype=boardgameexpansion")
		for res.StatusCode == 202 && err == nil && numRetries < 10 {
			numRetries++
			time.Sleep(500 * time.Second)
			res, err = http.Get("https://boardgamegeek.com/xmlapi2/collection?username=" + url.QueryEscape(userID) + "&own=1&excludesubtype=boardgameexpansion")
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
	if err != nil {
		return []Game{}, err
	}

	var infoErr error
	var gameInfoWG sync.WaitGroup
	gameInfoWG.Add(1)
	go func() {
		defer gameInfoWG.Done()
		for i, _ := range collRes.Games {
			err := collRes.Games[i].getGameInfo()
			if err != nil {
				infoErr = errors.Wrap(infoErr, err.Error())
			}
		}
	}()
	gameInfoWG.Wait()
	return collRes.Games, infoErr
}

func (game *Game) getGameInfo() error {
	res, err := http.Get("https://boardgamegeek.com/xmlapi2/thing?id=" + url.QueryEscape(game.ID))
	if err != nil {
		return err
	} else if res.StatusCode != 200 {
		body, err := ioutil.ReadAll(res.Body)
		if err != nil {
			return err
		}
		return errors.New("non-200 received from bgg: " + string(body))
	}

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		return err
	}

	var gameInfo parsedGameInfo
	err = xml.Unmarshal(body, &gameInfo)

	var tagsToKeep []Tag

	for _, tag := range gameInfo.Tags {
		if tag.Type == "boardgamemechanic" || tag.Type == "boardgamecategory" {
			tagsToKeep = append(tagsToKeep, tag)
		}
	}
	game.Info.Tags = tagsToKeep
	game.Info.MaxPlayers = gameInfo.MaxPlayers.Value
	game.Info.MinPlayers = gameInfo.MinPlayers.Value
	game.Info.MaxPlaytime = gameInfo.MaxPlaytime.Value
	game.Info.MinPlaytime = gameInfo.MinPlaytime.Value

	return err
}
