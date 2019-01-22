import React, { Component, ChangeEvent } from "react";
import { Button, Modal, Input, List, Image, Message, Grid, Checkbox, Container, Rating, Accordion, Icon, Menu, Dropdown, Divider } from 'semantic-ui-react';
import _ from "lodash";
import { withRouter } from "react-router-dom";
import { RouteComponentProps } from "react-router";
import io from 'socket.io-client';
import Loading from './Loading';
import styles from './room.module.scss';
import { string } from "prop-types";

// const client = io("http://localhost:8000")

enum Sort {
  AlphaDesc = 1,
  AlphaAsc,
  PlaytimeDesc,
  PlaytimeAsc,
  VotesDesc,
}

interface GameMap { [key: string]: Game }
class GameCollection {
  public games: GameMap = {}

  addGames(games: Array<Game>) {
    games.forEach(game => {
      if (!this.games[game.name]) {
        this.games[game.name] = new Game(game.thumbnail, game.name, game.info);
      }
    });
  }

  toArray(): Array<Game> {
    return Object.keys(this.games).map(key => this.games[key]);
  }
}

class Game {
  public thumbnail: string;
  public name: string;
  public info: GameInfo;
  public votes: Array<string> = [];
  public vetoes: Array<string> = [];

  constructor(thumbnail: string, name: string, info: GameInfo) {
    this.thumbnail = thumbnail;
    this.name = name;
    this.info = info;
  }

  addVote(user: string) {
    if (this.votes.indexOf(user) === -1) {
      this.votes.push(user);
    }
  }

  removeVote(user: string) {
    const userIndex = this.votes.indexOf(user)
    if (userIndex > -1) {
      this.votes.splice(userIndex, 1);
    }
  }

  addVeto(user: string) {
    if (this.vetoes.indexOf(user) === -1) {
      this.vetoes.push(user);
    }
  }

  removeVeto(user: string) {
    const userIndex = this.vetoes.indexOf(user)
    if (userIndex > -1) {
      this.vetoes.splice(userIndex, 1);
    }
  }
}

interface GameInfo {
  minPlayers: number;
  maxPlayers: number;
  minPlaytime: number;
  maxPlaytime: number;
  tags?: Array<Tag>
}

interface Tag {
  id: string;
  label: string;
}

interface AddBggUserRes {
  games: Array<Game>;
}

interface RoomInfo {
  games: Array<Game>;
  voteResults: VoteResults;
}

interface VoteObj {
  [key: string]: Array<string>;
}

interface VoteResults {
  votes: VoteObj;
  vetoes: VoteObj;
}

interface RoomState {
  bggUser: string;
  games: GameCollection;
  bggUserModalOpen: boolean;
  loadingGames: boolean;
  fetchError?: Error;
  initError?: Error;
  votesError?: Error;
  fetchErrorUser: string;
  filters: Array<Tag>;
  selectedFilters: Array<string>;
  selectedNumPlayers: number;
  selectedMinimumPlaytime: number;
  selectedMaximumPlaytime: number;
  showMechanics: boolean;
  userID: string;
  votes: Array<string>;
  vetoes: Array<string>;
  allVotes: VoteObj;
  allVetoes: VoteObj;
  savingVotes: boolean;
  sortBy: Sort;
}

interface RoomRouteParams {
  roomID: string;
}

class Room extends Component<RouteComponentProps<RoomRouteParams>, RoomState> {
  state: RoomState = {
    bggUser: "",
    games: new GameCollection(),
    bggUserModalOpen: false,
    loadingGames: false,
    fetchErrorUser: "",
    filters: [],
    selectedFilters: [],
    selectedNumPlayers: 0,
    selectedMaximumPlaytime: 0,
    selectedMinimumPlaytime: 0,
    showMechanics: false,
    userID: "",
    votes: [],
    vetoes: [],
    allVetoes: {},
    allVotes: {},
    savingVotes: false,
    sortBy: Sort.AlphaAsc
  };

  componentDidMount = () => {
    const { roomID } = this.props.match.params;
    const { filters, games } = this.state;
    let userID: string = localStorage.getItem("userID") || Math.floor(Math.random() * 10000) + "";
    localStorage.setItem("userID", userID)
    this.setState({ userID })
    fetch(`http://localhost:8000/rooms/${roomID}`)
      .then(res => res.json())
      .then((res: RoomInfo) => {
        let updatedFilters = [...filters]
        if (res.games) {
          res.games.forEach(game => {
            if (game.info.tags) {
              updatedFilters = updatedFilters.concat(game.info.tags);
            }
          })
          games.addGames(res.games)
          this.setState({ games: games, filters: _.uniqBy(updatedFilters, 'id') });
          if (res.voteResults.votes) {
            console.log(games.games);
            Object.keys(res.voteResults.votes).forEach(key => res.voteResults.votes[key].forEach(game => games.games[game] && games.games[game].addVote(key)))
            this.setState({ allVotes: res.voteResults.votes, votes: res.voteResults.votes[userID] || [] });
          }
          if (res.voteResults.vetoes) {
            Object.keys(res.voteResults.vetoes).forEach(key => res.voteResults.vetoes[key].forEach(game => games.games[game] && games.games[game].addVeto(key)))
            this.setState({ allVetoes: res.voteResults.vetoes, vetoes: res.voteResults.vetoes[userID] || [] })
          }
        }
      })
      .catch((err: Error) => {
        this.setState({ initError: err });
      });

    // client.emit('register', roomID)
    // client.on('addedVotesUpdate', function () { console.log('asdf'); console.log(arguments) })
    // client.addEventListener('addedVotesUpdate', function () { console.log('asdf'); console.log(arguments) })
    // client.on('addedVetoesUpdate', function () { console.log(arguments) })

    const ws = new WebSocket("ws://localhost:8000/echo");
    ws.onopen = function (evt) {
      ws.send('register:' + roomID)
    }
    ws.onclose = function (evt) {
      console.log("CLOSE");
    }
    ws.onmessage = function (evt) {
      console.log("RESPONSE: " + evt.data);
    }
    ws.onerror = function (evt) {
      console.log("ERROR: " + evt);
    }
  }

  toggleBggUserModal = () => {
    this.setState({ bggUserModalOpen: !this.state.bggUserModalOpen });
  };

  onUpdateBggUser = (e: ChangeEvent<HTMLElement>) => {
    let element = e.currentTarget as HTMLInputElement;
    this.setState({ bggUser: element.value });
  };

  getBggUser = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { roomID } = this.props.match.params;
    const { bggUser } = this.state;
    if (bggUser.length === 0) {
      return;
    }
    this.setState({ loadingGames: true });
    fetch(`http://localhost:8000/rooms/${roomID}/add/${bggUser}`, {
      method: "POST"
    })
      .then(res => res.json())
      .then((res: AddBggUserRes) => {
        const { games } = this.state;
        if (!res.games) {
          this.setState({ fetchError: new Error("User not found"), fetchErrorUser: bggUser, loadingGames: false })
          return
        }
        games.addGames(res.games)
        this.setState({ games: games, loadingGames: false, bggUserModalOpen: false });
      })
      .catch((err: Error) => {
        this.setState({ fetchError: err, fetchErrorUser: bggUser, loadingGames: false })
      });
  };

  // TODO: votes should be handled atomically
  addVote = (game: Game) => {
    const { roomID } = this.props.match.params;
    const { userID, votes, vetoes } = this.state;
    let newVotes = [...votes];
    let newVetoes = [...vetoes];
    if (newVotes.indexOf(game.name) > -1) {
      newVotes.splice(newVotes.indexOf(game.name), 1);
      newVetoes.push(game.name);
      game.removeVote(userID);
      game.addVeto(userID);
    } else if (newVetoes.indexOf(game.name) > -1) {
      newVetoes.splice(newVetoes.indexOf(game.name), 1);
      game.removeVeto(userID);
    } else {
      game.addVote(userID);
      newVotes.push(game.name)
    }
    this.setState({ savingVotes: true, votes: newVotes, vetoes: newVetoes });
    fetch(`http://localhost:8000/rooms/${roomID}/vote/${userID}`, {
      method: "POST",
      body: JSON.stringify({
        votes: newVotes,
        vetoes: newVetoes
      })
    })
      .then(() => this.setState({ savingVotes: false }))
      .catch((err: Error) => {
        this.setState({ votesError: err, savingVotes: false })
      });
  }

  toggleFilter = (filter: Tag) => {
    const { selectedFilters } = this.state;
    const filterIndex = selectedFilters.indexOf(filter.id);
    if (filterIndex > -1) {
      let newFilters = [...selectedFilters];
      newFilters.splice(filterIndex, 1);
      this.setState({ selectedFilters: newFilters });
      return;
    }
    this.setState({ selectedFilters: selectedFilters.concat(filter.id) })
  }

  render() {
    const {
      match: {
        params: { roomID }
      }
    } = this.props;
    const { bggUser, games, bggUserModalOpen, loadingGames, initError, fetchError, fetchErrorUser, selectedFilters, filters, selectedNumPlayers, selectedMaximumPlaytime, selectedMinimumPlaytime, showMechanics, votes, vetoes, sortBy, allVetoes, allVotes } = this.state;
    return (
      <Container>
        <Accordion>
          <Accordion.Title active={showMechanics} index={0} onClick={() => this.setState({ showMechanics: !showMechanics })}>
            <Icon name='dropdown' />
            Mechanic Filters
        </Accordion.Title>
          <Accordion.Content active={showMechanics}>
            {filters.map(filter => {
              return <Checkbox onChange={() => this.toggleFilter(filter)} checked={selectedFilters.indexOf(filter.id) > -1} label={filter.label} />
            })}
          </Accordion.Content>
        </Accordion>
        <p>Player Count:</p>
        <p>
          <Button.Group buttons={[1, 2, 3, 4, 5, 6, 7].map(num => <Button active={selectedNumPlayers === num} onClick={() => this.setState({ selectedNumPlayers: selectedNumPlayers === num ? 0 : num })}>{num}</Button>)} />
        </p>
        <p>
          <Dropdown text='Sort by...' value={sortBy}>
            <Dropdown.Menu>
              <Dropdown.Item value={Sort.AlphaAsc} onClick={() => this.setState({ sortBy: Sort.AlphaAsc })} text='Alphabetical' icon='caret up' />
              <Dropdown.Item value={Sort.AlphaDesc} onClick={() => this.setState({ sortBy: Sort.AlphaDesc })} text='Alphabetical' icon='caret down' />
              <Dropdown.Item value={Sort.PlaytimeAsc} onClick={() => this.setState({ sortBy: Sort.PlaytimeAsc })} text='Playtime' icon='caret up' />
              <Dropdown.Item value={Sort.PlaytimeDesc} onClick={() => this.setState({ sortBy: Sort.PlaytimeDesc })} text='Playtime' icon='caret down' />
              <Dropdown.Item value={Sort.VotesDesc} onClick={() => this.setState({ sortBy: Sort.VotesDesc })} text='Votes' icon='caret down' />
            </Dropdown.Menu>
          </Dropdown>
        </p>
        {initError && <Message negative>
          <Message.Header>Failed to retrieve current room info</Message.Header>
          <p>{initError.message}</p>
        </Message>}
        <Modal trigger={<Button onClick={this.toggleBggUserModal}>Add BGG User Collection</Button>}
          open={bggUserModalOpen}
          onClose={this.toggleBggUserModal}>
          <Modal.Header>Add a BGG User</Modal.Header>
          <Modal.Content>
            <Modal.Description>
              <p>Enter the BoardGameGeek username of the collection that you would like to add.</p>
              <form onSubmit={this.getBggUser}>
                <Input name="bggUser" value={bggUser} onChange={this.onUpdateBggUser} action>
                  <input />
                  <Button loading={loadingGames} disabled={loadingGames} type="submit">Get BGG User</Button>
                </Input>
                {fetchError && <Message negative>
                  <Message.Header>Failed to retrieve games for user {fetchErrorUser}</Message.Header>
                  <p>{fetchError.message}</p>
                </Message>}
              </form>
            </Modal.Description>
          </Modal.Content>
        </Modal>
        <Grid columns={5} verticalAlign="middle" relaxed>
          {games.toArray().sort((a, b) => {
            function getPlaytime(game: Game) {
              return (game.info.maxPlaytime + game.info.minPlaytime) / 2;
            }
            switch (sortBy) {
              default:
              case Sort.AlphaAsc: return a.name.localeCompare(b.name);
              case Sort.AlphaDesc: return -a.name.localeCompare(b.name);
              case Sort.PlaytimeAsc: return getPlaytime(a) - getPlaytime(b);
              case Sort.PlaytimeDesc: return -getPlaytime(a) + getPlaytime(b);
              case Sort.VotesDesc: return b.votes.length - a.votes.length;
            }
          }).map(game => {
            const includesFilter = selectedFilters.some(filter => !!game.info.tags && game.info.tags.some(tag => tag.id === filter)) || selectedFilters.length === 0;
            const inPlayerCount = (game.info.minPlayers <= selectedNumPlayers && game.info.maxPlayers >= selectedNumPlayers) || selectedNumPlayers === 0;
            if (includesFilter && inPlayerCount) {
              const isVote = votes.indexOf(game.name) > -1;
              const isVeto = vetoes.indexOf(game.name) > -1;
              return <Grid.Column>
                <Image onClick={() => this.addVote(game)} inline size="small" src={game.thumbnail} centered />
                <Icon className={styles.voteIcon} size="big" name={isVeto ? 'x' : 'check circle outline'} color={isVote ? 'green' : isVeto ? 'red' : 'black'}></Icon>
                {game.votes ? <span className={styles.imageVoteOverlay}>{game.votes.length}</span> : ''}
                {game.vetoes ? <span className={styles.imageVetoOverlay}>{game.vetoes.length}</span> : ''}
              </Grid.Column>
            }
            return false;
          })}
        </Grid>
      </Container>
    );
  }
}

export default withRouter(Room);
