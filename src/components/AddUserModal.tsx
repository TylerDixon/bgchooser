import React, { ChangeEvent } from "react";
import { Modal, Input, Button, Message, Checkbox } from "semantic-ui-react";
import xml2js from "xml2js";
import { BggUserInfo, Game, GameCollection } from "../types/game";
import styles from "./addusermodal.module.scss";

const MAX_GET_USER_ITER = 10;

interface AddUserModalProps {
  addGames: (games: Array<Game>) => void;
  onClose: () => void;
  switchGameModal: () => void;
  gamesInRoom: GameCollection;
  roomID: string;
}

interface AddUserModalState {
  bggUser: string;
  loading: boolean;
  addingGames: boolean;
  fetchError?: Error;
  fetchErrorUser?: string;
  fetchInfo: string;
  addGamesError?: Error;
  allGames: Array<Game>;
  gamesToAdd: Array<Game>;
}

class AddUserModal extends React.Component<
  AddUserModalProps,
  AddUserModalState
> {
  state: AddUserModalState = {
    bggUser: "",
    fetchInfo: "",
    loading: false,
    addingGames: false,
    allGames: [],
    gamesToAdd: []
  };

  onUpdateBggUser = (e: ChangeEvent<HTMLElement>) => {
    let element = e.currentTarget as HTMLInputElement;
    this.setState({ bggUser: element.value });
  };

  getCallIter = (user: string, iter: number): Promise<Response> => {
    if (iter > MAX_GET_USER_ITER) {
      return Promise.reject(
        new Error(
          "Max number of retries to get BGG User reached, please try again."
        )
      );
    }
    return fetch(
      `https://www.boardgamegeek.com/xmlapi2/collection?username=${encodeURIComponent(
        user
      )}&own=1&excludesubtype=boardgameexpansion&stats=1&wishlist=0`,
      { mode: "cors" }
    )
      .then(res => {
        if (res.status === 202) {
          return new Promise<Response>(resolve =>
            setTimeout(() => resolve(this.getCallIter(user, iter++)), 500)
          );
        }
        return res;
      })
      .catch(err => {
        console.log(err);
        throw err;
      });
  };

  getUserCall = (user: string, iter: number): Promise<BggUserInfo> => {
    return this.getCallIter(user, iter)
      .then(res => {
        if (!res.ok) {
          return res.text().then(text => Promise.reject(new Error(text)));
        }
        return res.text();
      })
      .then((str: string) => {
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
        var info: BggUserInfo = { games: [] };
        info.games = xml.items.item.map((item: any) => {
          return new Game(item.$.objectid, item.thumbnail[0], item.name[0]._, {
            minPlayers: parseInt(item.stats[0].$.minplayers, 10),
            maxPlayers: parseInt(item.stats[0].$.maxplayers, 10),
            minPlaytime: parseInt(item.stats[0].$.minplaytime, 10),
            maxPlaytime: parseInt(item.stats[0].$.maxplaytime, 10)
          });
        });
        return info;
      });
  };

  getBggUserLocally = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { gamesInRoom } = this.props;
    const { bggUser } = this.state;
    if (bggUser.length === 0) {
      return;
    }
    this.setState({ fetchError: undefined, loading: true });
    this.getUserCall(bggUser, 1)
      .then((res: BggUserInfo) => {
        if (!res.games) {
          this.setState({
            fetchError: new Error("User not found"),
            fetchErrorUser: bggUser,
            loading: false
          });
          return;
        }
        const allGames = res.games.filter(game => !gamesInRoom.games[game.id]);
        if (res.games.length > 0 && allGames.length === 0) {
          this.setState({
            fetchInfo:
              "All of this user's games have already been added to the room, try another user",
            loading: false
          });
          return;
        }
        this.setState({
          allGames,
          loading: false
        });
      })
      .catch((err: Error) => {
        this.setState({
          fetchError: err,
          fetchErrorUser: bggUser,
          loading: false
        });
      });
  };

  // No longer used, keeping around in case this approach wants to be taken again
  // Previously, we would get the games from a user via the bgchooser API
  // With too many users though, this results in frequently hitting the
  // BGG API rate limiting

  // Double comment: Decided to put this back into use since BGG XML API doesn't send back CORS
  // headers on errors, but they do for successful responses... So for now, it's best to just
  // let the server handle it
  _getBggUser = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { roomID, gamesInRoom } = this.props;
    const { bggUser } = this.state;
    if (bggUser.length === 0) {
      return;
    }
    this.setState({ fetchError: undefined, loading: true });
    fetch(`/api/rooms/${roomID}/bgguser/${encodeURIComponent(bggUser)}`)
      .then(res => {
        if (!res.ok) {
          return res.text().then(text => Promise.reject(new Error(text)));
        }
        return res.json();
      })
      .then((res: BggUserInfo) => {
        if (!res.games) {
          this.setState({
            fetchError: new Error("User not found"),
            fetchErrorUser: bggUser,
            loading: false
          });
          return;
        }
        const allGames = res.games.filter(game => !gamesInRoom.games[game.id]);
        if (res.games.length > 0 && allGames.length === 0) {
          this.setState({
            fetchInfo:
              "All of this user's games have already been added to the room, try another user",
            loading: false
          });
          return;
        }
        this.setState({
          allGames,
          loading: false
        });
      })
      .catch((err: Error) => {
        this.setState({
          fetchError: err,
          fetchErrorUser: bggUser,
          loading: false
        });
      });
  };

  addGames = () => {
    const { roomID, addGames, onClose } = this.props;
    const { bggUser, gamesToAdd } = this.state;
    if (bggUser.length === 0) {
      return;
    }
    this.setState({ addGamesError: undefined, addingGames: true });
    fetch(`/api/rooms/${roomID}/bgguser/${encodeURIComponent(bggUser)}`, {
      method: "POST",
      body: JSON.stringify({ games: gamesToAdd })
    })
      .then(res => {
        if (!res.ok) {
          return res.text().then(text => Promise.reject(new Error(text)));
        }
        return res.json().then((res: BggUserInfo) => {
          addGames(res.games);
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

  toggleGame = (game: Game) => {
    const { gamesToAdd } = this.state;
    const gameIndex = gamesToAdd.indexOf(game);
    let newGamesToAdd = [...gamesToAdd];
    if (gameIndex !== -1) {
      newGamesToAdd.splice(gameIndex, 1);
    } else {
      newGamesToAdd.push(game);
    }

    this.setState({ gamesToAdd: newGamesToAdd });
  };

  selectAllGames = () =>
    this.setState({ gamesToAdd: this.state.allGames.slice(0) });

  unselectAllGames = () => this.setState({ gamesToAdd: [] });

  render() {
    const { onClose, switchGameModal } = this.props;
    const {
      bggUser,
      fetchError,
      fetchErrorUser,
      gamesToAdd,
      allGames,
      loading,
      addingGames,
      addGamesError,
      fetchInfo
    } = this.state;
    return (
      <Modal
        open
        onClose={onClose}
        closeIcon
        className={styles.addUserModal}
        centered={false}
      >
        <Modal.Header>Add a BGG User</Modal.Header>
        <Modal.Content scrolling>
          <Modal.Description className={styles.modalBody}>
            {allGames.length == 0 && (
              <form onSubmit={this._getBggUser}>
                <p>
                  Enter the BoardGameGeek username of the collection that you
                  would like to add. You will be able to choose which games in
                  the collection you want to add to the vote.
                </p>
                <Input
                  name="bggUser"
                  placeholder="BGG User Name"
                  value={bggUser}
                  onChange={this.onUpdateBggUser}
                  action
                >
                  <input />
                  <Button loading={loading} disabled={loading} type="submit">
                    Get BGG User Games
                  </Button>
                </Input>
                {fetchError && (
                  <Message negative>
                    <Message.Header>
                      Failed to retrieve games for user {fetchErrorUser}
                    </Message.Header>
                    <p>{fetchError.message}</p>
                    <p>
                      User may not be found, either try again or try another
                      user name.
                    </p>
                  </Message>
                )}
                <a onClick={switchGameModal} className={styles.switchModalLink}>
                  Add a single game instead
                </a>
              </form>
            )}
            {allGames.length > 0 && (
              <div>
                <p>
                  Select all of the games you would like to add to be voted on
                  below, then click "Add Selected Games".
                </p>
                <Button
                  onClick={this.selectAllGames}
                  content="Select All Games"
                />
                <Button
                  onClick={this.unselectAllGames}
                  content="Unselect All Games"
                />
                {allGames.map(game => (
                  <Checkbox
                    className={styles.gameCheckbox}
                    label={game.name}
                    checked={gamesToAdd.indexOf(game) > -1}
                    onChange={() => this.toggleGame(game)}
                  />
                ))}

                {addGamesError && (
                  <Message negative>
                    <Message.Header>
                      Failed to retrieve games for user {bggUser}
                    </Message.Header>
                    <p>{addGamesError.message}</p>
                  </Message>
                )}
              </div>
            )}
            {fetchInfo && (
              <Message info>
                <p>{fetchInfo}</p>
              </Message>
            )}
          </Modal.Description>
        </Modal.Content>
        <Modal.Actions>
          {gamesToAdd.length > 0 && (
            <Button
              primary
              onClick={this.addGames}
              content="Add Selected Games"
              loading={addingGames}
            />
          )}
          <Button onClick={onClose} content="Cancel" />
        </Modal.Actions>
      </Modal>
    );
  }
}
export default AddUserModal;
