import React, { ChangeEvent } from "react";
import {
  Modal,
  Icon,
  Input,
  Button,
  Message,
  Checkbox
} from "semantic-ui-react";
import { BggUserInfo, Game, GameCollection } from "../types/game";
import styles from "./addusermodal.module.scss";

interface AddUserModalProps {
  addGames: (games: Array<Game>) => void;
  onClose: () => void;
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

  getBggUser = (e: React.FormEvent<HTMLFormElement>) => {
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
        const allGames = res.games.filter(
          game => !gamesInRoom.games[game.name]
        );
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
    const { onClose } = this.props;
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
      <Modal open onClose={onClose} closeIcon className={styles.addUserModal}>
        <Modal.Header>Add a BGG User</Modal.Header>
        <Modal.Content scrolling>
          <Modal.Description>
            {allGames.length == 0 && (
              <form onSubmit={this.getBggUser}>
                <p>
                  Enter the BoardGameGeek username of the collection that you
                  would like to add.
                </p>
                <Input
                  name="bggUser"
                  value={bggUser}
                  onChange={this.onUpdateBggUser}
                  action
                >
                  <input />
                  <Button loading={loading} disabled={loading} type="submit">
                    Get BGG User
                  </Button>
                </Input>
                {fetchError && (
                  <Message negative>
                    <Message.Header>
                      Failed to retrieve games for user {fetchErrorUser}
                    </Message.Header>
                    <p>{fetchError.message}</p>
                  </Message>
                )}
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
