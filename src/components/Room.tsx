import React, { Component, ChangeEvent } from "react";
import { Button, Modal, Input, List, Image, Message, Grid, Checkbox, Container, Rating, Accordion, Icon } from 'semantic-ui-react';
import _ from "lodash";
import { withRouter } from "react-router-dom";
import { RouteComponentProps } from "react-router";
import ReactModal from 'react-modal';
import Loading from './Loading';
import styles from './room.module.scss';
import { string } from "prop-types";

interface Game {
  thumbnail: string;
  name: string;
  info: GameInfo
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
  games: Array<Game>;
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
  allVotes: {};
  allVetoes: {};
  savingVotes: boolean;
}

interface RoomRouteParams {
  roomID: string;
}

class Room extends Component<RouteComponentProps<RoomRouteParams>, RoomState> {
  state: RoomState = {
    bggUser: "",
    games: Array<Game>(),
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
    allVetoes: new Map<string, Array<string>>(),
    allVotes: new Map<string, Array<string>>(),
    savingVotes: false
  };

  componentDidMount = () => {
    const { roomID } = this.props.match.params;
    const { filters } = this.state;
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
          this.setState({ games: _.uniqBy(res.games, 'name'), filters: _.uniqBy(updatedFilters, 'id') });
          if (res.voteResults.votes) {
            this.setState({ allVotes: res.voteResults.votes, votes: res.voteResults.votes[userID] || [] });
          }
          if (res.voteResults.vetoes) {
            this.setState({ allVetoes: res.voteResults.vetoes, vetoes: res.voteResults.vetoes[userID] || [] })
          }
        }
      })
      .catch((err: Error) => {
        this.setState({ initError: err });
      })
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
        this.setState({ games: _.unionBy(games, res.games, 'name'), loadingGames: false, bggUserModalOpen: false });
      })
      .catch((err: Error) => {
        this.setState({ fetchError: err, fetchErrorUser: bggUser, loadingGames: false })
      });
  };

  // TODO: votes should be handled atomically
  addVote = (game: string) => {
    const { roomID } = this.props.match.params;
    const { userID, votes, vetoes } = this.state;
    let newVotes = [...votes];
    let newVetoes = [...vetoes];
    if (newVotes.indexOf(game) > -1) {
      newVotes.splice(newVotes.indexOf(game), 1);
      newVetoes.push(game);
    } else if (newVetoes.indexOf(game) > -1) {
      newVetoes.splice(newVetoes.indexOf(game), 1);
    } else {
      newVotes.push(game)
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
    const { bggUser, games, bggUserModalOpen, loadingGames, initError, fetchError, fetchErrorUser, selectedFilters, filters, selectedNumPlayers, selectedMaximumPlaytime, selectedMinimumPlaytime, showMechanics, votes, vetoes } = this.state;
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
          {games.map(game => {
            const includesFilter = selectedFilters.some(filter => !!game.info.tags && game.info.tags.some(tag => tag.id === filter)) || selectedFilters.length === 0;
            const inPlayerCount = (game.info.minPlayers <= selectedNumPlayers && game.info.maxPlayers >= selectedNumPlayers) || selectedNumPlayers === 0;
            if (includesFilter && inPlayerCount) {
              const isVote = votes.indexOf(game.name) > -1;
              const isVeto = vetoes.indexOf(game.name) > -1;
              return <Grid.Column>
                <Image onClick={() => this.addVote(game.name)} inline size="small" src={game.thumbnail} centered />
                <Icon className={styles.voteIcon} size="big" name={isVeto ? 'x' : 'check circle outline'} color={isVote ? 'green' : isVeto ? 'red' : 'black'}></Icon>
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
