package main

import (
	"github.com/tylerdixon/bgchooser/api"
)

func main() {
	serv := api.New()
	serv.Start(":8000")
}
