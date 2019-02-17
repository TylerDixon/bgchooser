import React, { ChangeEvent } from "react";
import _ from "lodash";
import {
  Modal,
  Button,
  Message,
  Search,
  SearchResultData,
  SearchProps
} from "semantic-ui-react";
import xml2js from "xml2js";
import { Game, GameCollection, AddGameRes } from "../types/game";
import styles from "./writeinmodal.module.scss";

interface SearchGame {
  name: string;
  year: string;
  id: string;
}

interface WriteInModalProps {
  addGames: (games: Array<Game>) => void;
  onClose: () => void;
  switchGameModal: () => void;
  gamesInRoom: GameCollection;
  roomID: string;
  userID: string;
}

interface WriteInModalState {
  addingGames: boolean;
  addGamesError?: Error;
  gameName: string;
  selectedGame?: SearchGame;
  playTime: number;
  minPlayers: number;
  maxPlayers: number;
  searchGames: Array<SearchGame>;
  loadingSearchGames: boolean;
}

class WriteInModal extends React.Component<
  WriteInModalProps,
  WriteInModalState
> {
  state: WriteInModalState = {
    addingGames: false,
    loadingSearchGames: false,
    gameName: "",
    playTime: 0,
    minPlayers: 0,
    maxPlayers: 0,
    searchGames: []
  };

  onUpdateGameName = (e: ChangeEvent<HTMLElement>) => {
    let element = e.currentTarget as HTMLInputElement;
    this.setState({ gameName: element.value });
  };

  searchGames = _.debounce(
    (event: any, data: SearchProps) => {
      const { gameName } = this.state;
      if (gameName.length < 3) {
        return;
      }
      this.setState({ loadingSearchGames: true, searchGames: [] });
      fetch(
        "https://boardgamegeek.com/xmlapi2/search?type=boardgame&query=" +
          encodeURIComponent(gameName)
      )
        .then(res => res.text())
        .then(str => {
          const p = new Promise(function(resolve, reject) {
            xml2js.parseString(str, (err, result) => {
              if (err) {
                reject(err);
              }
              resolve(result);
            });
          });
          return p;
        })
        .then((xml: any) => {
          if (xml.items.$.total === "0") {
            this.setState({ loadingSearchGames: false });
            return;
          }
          const searchGames: Array<SearchGame> = xml.items.item.map(
            (item: any) => {
              return {
                name: item.name[0].$.value,
                year: item.yearpublished ? item.yearpublished[0].$.value : "",
                id: item.$.id
              };
            }
          );

          this.setState({ searchGames, loadingSearchGames: false });
        })
        .catch(err => {
          this.setState({ addGamesError: err, loadingSearchGames: false });
        });
    },
    500,
    { leading: true }
  );

  selectGame = (_event: any, data: SearchResultData) => {
    const { searchGames, gameName } = this.state;
    const selectedGame = searchGames.filter(
      game => game.id === data.result.id
    )[0];
    this.setState({
      selectedGame,
      gameName: selectedGame ? selectedGame.name : gameName
    });
  };

  addGame = () => {
    const { roomID, userID, onClose, addGames } = this.props;
    const { selectedGame } = this.state;
    if (!selectedGame) {
      return;
    }
    this.setState({ addGamesError: undefined, addingGames: true });
    fetch(`/api/rooms/${roomID}/games/${userID}/${selectedGame.id}`, {
      method: "POST"
    })
      .then(res => {
        if (!res.ok) {
          return res.text().then(text => Promise.reject(new Error(text)));
        }
        return res.json().then((res: AddGameRes) => {
          addGames([res.game]);
          onClose();
        });
      })
      .catch((err: Error) => {
        this.setState({
          addGamesError: err,
          addingGames: false
        });
      });
  };

  render() {
    const { onClose, switchGameModal } = this.props;
    const {
      addingGames,
      addGamesError,
      loadingSearchGames,
      searchGames,
      selectedGame,
      gameName
    } = this.state;
    return (
      <Modal open onClose={onClose} closeIcon centered={false}>
        <Modal.Header>Add a Game</Modal.Header>
        <Modal.Content>
          <Modal.Description>
            <p>
              Use the search field below to find a game on BGG to add to the
              room:
            </p>
            <Search
              fluid
              size="large"
              value={gameName}
              minCharacters={3}
              loading={loadingSearchGames}
              onResultSelect={this.selectGame}
              onSearchChange={(event, data) => {
                this.setState({ gameName: data.value ? data.value : "" });
                this.searchGames(event, data);
              }}
              results={searchGames}
              resultRenderer={game => (
                <div key={game.id}>
                  <div className="title">
                    {game.name} {game.year && `(${game.year})`}
                  </div>
                </div>
              )}
              {...this.props}
            />
            <a onClick={switchGameModal} className={styles.switchModalLink}>
              Add a BGG user collection instead
            </a>
            {addGamesError && (
              <Message info>
                <p>{addGamesError.message}</p>
              </Message>
            )}
          </Modal.Description>
        </Modal.Content>
        <Modal.Actions>
          {selectedGame && (
            <Button
              primary
              onClick={this.addGame}
              content="Add Game"
              loading={addingGames}
            />
          )}
          <Button onClick={onClose} content="Cancel" />
        </Modal.Actions>
      </Modal>
    );
  }
}
export default WriteInModal;
