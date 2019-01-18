package bggclient

import (
	"encoding/xml"
	"errors"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"sync"
	"time"
)

type collectionRes struct {
	Names []string `xml:"item>name"`
}

func GetUserCollection(userID string) ([]string, error) {
	var res *http.Response
	var err error
	var wg sync.WaitGroup
	wg.Add(1)

	log.Println("asdf")
	log.Println(userID)
	go func() {
		defer wg.Done()
		log.Println("asdf")
		log.Println(userID)
		res, err = http.Get("https://boardgamegeek.com/xmlapi2/collection?username=" + url.QueryEscape(userID) + "&own=1")
		for res.StatusCode == 202 && err == nil {
			time.Sleep(500 * time.Second)
			res, err = http.Get("https://boardgamegeek.com/xmlapi2/collection?username=" + url.QueryEscape(userID) + "&own=1")
		}
	}()
	wg.Wait()

	if err != nil {
		return []string{}, nil
	} else if res.StatusCode != 200 {
		body, err := ioutil.ReadAll(res.Body)
		if err != nil {
			return []string{}, err
		}
		return []string{}, errors.New("non-200 received from bgg: " + string(body))
	}

	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		return []string{}, err
	}

	log.Println(string(body))
	var collRes collectionRes
	err = xml.Unmarshal(body, &collRes)
	if err != nil {
		return []string{}, err
	}
	log.Println(collRes)
	return collRes.Names, nil
}
