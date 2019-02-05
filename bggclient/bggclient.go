package bggclient

import (
	"encoding/xml"
	"io/ioutil"
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
	Info      GameInfo `xml:"stats" json:"info"`
}

type GameInfo struct {
	MinPlayers  int `xml:"minplayers,attr" json:"minPlayers"`
	MaxPlayers  int `xml:"maxplayers,attr" json:"maxPlayers"`
	MinPlaytime int `xml:"minplaytime,attr" json:"minPlaytime"`
	MaxPlaytime int `xml:"maxplaytime,attr" json:"maxPlaytime"`
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

func GetUserCollection(userID string, currentGames []Game) ([]Game, error) {
	var res *http.Response
	var err error
	var wg sync.WaitGroup
	wg.Add(1)
	numRetries := 0

	go func() {
		defer wg.Done()
		reqString := "https://boardgamegeek.com/xmlapi2/collection?username=" + url.QueryEscape(userID) + "&own=1&excludesubtype=boardgameexpansion&stats=1&wishlist=0"
		res, err = http.Get(reqString)
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
	// var infoErr error
	// Leaving out getting game info for now, this will probably need to move out to it's own microservice
	// var gameInfoWG sync.WaitGroup
	// gameInfoWG.Add(1)
	// go func() {
	// 	defer gameInfoWG.Done()
	// 	for i, game := range collRes.Games {
	// 		hasGame := false
	// 		var retrievedGame Game
	// 		for _, currentGame := range currentGames {
	// 			if currentGame.Name == game.Name {
	// 				hasGame = true
	// 				retrievedGame = currentGame
	// 			}
	// 		}
	// 		if !hasGame {
	// 			err := collRes.Games[i].getGameInfo()
	// 			log.Println("recieved info for game: " + game.Name)
	// 			if err != nil {
	// 				log.Println("Failed to get info for game " + game.Name)
	// 				log.Println(err)
	// 				infoErr = errors.Wrap(infoErr, err.Error())
	// 			}
	// 			progressUpdater(float32(i+1)/float32(len(collRes.Games)), collRes.Games[i], true, err)
	// 			time.Sleep(time.Second)
	// 		} else {
	// 			progressUpdater(float32(i+1)/float32(len(collRes.Games)), retrievedGame, false, err)
	// 		}
	// 	}
	// }()
	// gameInfoWG.Wait()
	// return collRes.Games, infoErr
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
	game.Info.MaxPlayers = gameInfo.MaxPlayers.Value
	game.Info.MinPlayers = gameInfo.MinPlayers.Value
	game.Info.MaxPlaytime = gameInfo.MaxPlaytime.Value
	game.Info.MinPlaytime = gameInfo.MinPlaytime.Value

	return err
}
