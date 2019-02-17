package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/tylerdixon/bgchooser/api"
)

var portFlag *string

func init() {
	portFlag = flag.String("port", "8000", "port to run service on")
}
func main() {
	flag.Usage = func() {
		fmt.Printf("Usage: %s [OPTIONS] argument ...\n", os.Args[0])
		flag.PrintDefaults()
	}
	flag.Parse()
	serv := api.New()
	serv.Start(":" + *portFlag)
}
