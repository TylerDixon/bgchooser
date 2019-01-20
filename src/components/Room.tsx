import React, { Component, ChangeEvent } from "react";
import { Button, Modal, Input, List, Image, Message, Grid, Checkbox, Container, Rating, Accordion, Icon } from 'semantic-ui-react';
import _ from "lodash";
import { withRouter } from "react-router-dom";
import { RouteComponentProps } from "react-router";
import ReactModal from 'react-modal';
import Loading from './Loading';
import style from './room.module.scss';

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
  votes: Array<string>;
  vetoes: Array<string>;
}

interface RoomState {
  bggUser: string;
  games: Array<Game>;
  bggUserModalOpen: boolean;
  loadingGames: boolean;
  fetchError?: Error;
  initError?: Error;
  fetchErrorUser: string;
  filters: Array<Tag>;
  selectedFilters: Array<string>;
  selectedNumPlayers: number;
  selectedMinimumPlaytime: number;
  selectedMaximumPlaytime: number;
  showMechanics: boolean;
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
    showMechanics: false
  };

  componentDidMount = () => {
    const { roomID } = this.props.match.params;
    const { filters } = this.state;
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
          this.setState({ games: _.uniqBy(res.games, 'name'), filters: _.uniqBy(updatedFilters, 'id') })
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
    const { bggUser, games, bggUserModalOpen, loadingGames, initError, fetchError, fetchErrorUser, selectedFilters, filters, selectedNumPlayers, selectedMaximumPlaytime, selectedMinimumPlaytime, showMechanics } = this.state;
    return (
      <div>
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
        </Container>
        <Container>
          <p>Player Count:</p>
          <p>
            <Button.Group buttons={[1, 2, 3, 4, 5, 6, 7].map(num => <Button active={selectedNumPlayers === num} onClick={() => this.setState({ selectedNumPlayers: selectedNumPlayers === num ? 0 : num })}>{num}</Button>)} />
          </p>
        </Container>
        {initError && <Message negative>
          <Message.Header>Failed to retrieve current room info</Message.Header>
          <p>{initError.message}</p>
        </Message>}
        <Grid columns={5} verticalAlign="middle" relaxed>
          {games.map(game => {
            const includesFilter = selectedFilters.some(filter => !!game.info.tags && game.info.tags.some(tag => tag.id === filter)) || selectedFilters.length === 0;
            const inPlayerCount = (game.info.minPlayers <= selectedNumPlayers && game.info.maxPlayers >= selectedNumPlayers) || selectedNumPlayers === 0;
            if (includesFilter && inPlayerCount) {
              return <Grid.Column>
                <Image inline size="small" src={game.thumbnail} centered />
              </Grid.Column>
            }
            return false;
          })}
        </Grid>
        <List>
        </List>
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
      </div>
    );
  }
}

export default withRouter(Room);
