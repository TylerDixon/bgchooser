package main

import (
	"flag"

	"github.com/tylerdixon/bgchooser/api"
)

var portFlag *string

func init() {
	portFlag = flag.String("port", "8000", "port to run service on")
}
func main() {
	serv := api.New()
	serv.Start(":" + *portFlag)
}
