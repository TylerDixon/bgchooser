import React, { Component, ChangeEvent, SyntheticEvent } from "react";
import {
  Button,
  Modal,
  Input,
  List,
  Image,
  Message,
  Grid,
  Checkbox,
  Container,
  Rating,
  Accordion,
  Icon,
  Menu,
  Dropdown,
  Divider,
  Progress,
  Segment,
  Sticky,
  Ref,
  Sidebar,
  Header,
  Popup,
  DropdownProps,
  Card,
  CardGroup
} from "semantic-ui-react";
import _ from "lodash";
import { withRouter } from "react-router-dom";
import { RouteComponentProps } from "react-router";
import classnames from "classnames";
import copy from "copy-to-clipboard";
import io from "socket.io-client";
import Loading from "./Loading";
import styles from "./room.module.scss";
import { string } from "prop-types";
import IntroModal from "./IntroModal";
import {
  Game,
  GameCollection,
  Tag,
  VoteObj,
  RoomInfo,
  SubscriptionMessage,
  UpdateType
} from "../types/game";
import AddUserModal from "./AddUserModal";
import WriteInModal from "./WriteInModal";

// const client = io("http://localhost:8000")

enum Sort {
  AlphaDesc = 1,
  AlphaAsc,
  PlaytimeDesc,
  PlaytimeAsc,
  VotesDesc
}

interface RoomState {
  bggUser: string;
  games: GameCollection;
  bggUserModalOpen: boolean;
  writeInModalOpen: boolean;
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
  addingGamesProgress: number;
  latestGameAdded: string;
  showVotes: boolean;
  introModalOpen: boolean;
  showGameInfo: boolean;
}

interface RoomRouteParams {
  roomID: string;
}

class Room extends Component<RouteComponentProps<RoomRouteParams>, RoomState> {
  state: RoomState = {
    bggUser: "",
    games: new GameCollection(),
    bggUserModalOpen: false,
    writeInModalOpen: false,
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
    sortBy: Sort.AlphaAsc,
    addingGamesProgress: 0,
    latestGameAdded: "",
    showVotes: false,
    introModalOpen: false,
    showGameInfo: false
  };

  //TODO: Better way to handle? (don't need state)
  private _mainContainer = React.createRef<HTMLDivElement>();

  socket: WebSocket = new WebSocket(`ws://${location.host}/api/echo`);

  componentDidMount = () => {
    const { roomID } = this.props.match.params;
    const { filters, games } = this.state;
    let userID: string =
      localStorage.getItem(roomID + ":userID") ||
      Math.floor(Math.random() * 10000) + "";
    if (!localStorage.getItem(roomID + ":userID")) {
      this.setState({ introModalOpen: true });
    }
    localStorage.setItem(roomID + ":userID", userID);
    this.setState({ userID });
    fetch(`/api/rooms/${roomID}`)
      .then(res => res.json())
      .then((res: RoomInfo) => {
        let updatedFilters = [...filters];
        if (res.games) {
          res.games.forEach(game => {
            if (game.info.tags) {
              updatedFilters = updatedFilters.concat(game.info.tags);
            }
          });
          games.addGames(res.games);
          this.setState({
            games: games,
            filters: _.uniqBy(updatedFilters, "id")
          });
          if (res.voteResults.votes) {
            console.log(games.games);
            Object.keys(res.voteResults.votes).forEach(key =>
              res.voteResults.votes[key].forEach(
                game => games.games[game] && games.games[game].addVote(key)
              )
            );
            this.setState({
              allVotes: res.voteResults.votes,
              votes: res.voteResults.votes[userID] || []
            });
          }
          if (res.voteResults.vetoes) {
            Object.keys(res.voteResults.vetoes).forEach(key =>
              res.voteResults.vetoes[key].forEach(
                game => games.games[game] && games.games[game].addVeto(key)
              )
            );
            this.setState({
              allVetoes: res.voteResults.vetoes,
              vetoes: res.voteResults.vetoes[userID] || []
            });
          }
        }
      })
      .catch((err: Error) => {
        this.setState({ initError: err });
      });

    this.socket.onopen = evt => {
      this.socket.send("register:" + roomID);
    };
    this.socket.onmessage = evt => {
      console.log(evt.data);
      const data: SubscriptionMessage = JSON.parse(evt.data);
      if (data.type === UpdateType.UpdateTypeAddedVotes) {
        this.state.games
          .toArray()
          .forEach(game => game.handleUser(data.user, data.votes, data.vetoes));
      } else if (data.type === UpdateType.UpdateTypeAddedGames) {
        this.state.games.addGames(data.games);
      } else if (data.type === UpdateType.UpdateTypeResetVotes) {
        this.state.games.resetVotes();
        this.setState({ votes: [], vetoes: [] });
      }

      this.setState({ games: this.state.games });
      this.forceUpdate();
    };
    this.socket.onerror = evt => {
      this.setState({
        initError: new Error(
          "Error connecting to service. Refresh page to try again."
        )
      });
    };
  };

  toggleBggUserModal = () => {
    this.setState({ bggUserModalOpen: !this.state.bggUserModalOpen });
  };

  onPlayerNumberChange = (e: SyntheticEvent, data: DropdownProps) => {
    const selectedNumPlayers = data.value as number;
    this.setState({
      selectedNumPlayers: selectedNumPlayers ? selectedNumPlayers : 0
    });
  };

  addGames = (gamesToAdd: Array<Game>) => {
    const { games } = this.state;
    games.addGames(gamesToAdd);
    this.setState({ games });
  };

  // TODO: votes should be handled atomically
  addVote = (game: Game, isVote: boolean) => {
    const { roomID } = this.props.match.params;
    const { userID, votes, vetoes } = this.state;
    let newVotes = [...votes];
    let newVetoes = [...vetoes];
    if (isVote) {
      if (vetoes.indexOf(game.name) > -1) {
        game.removeVeto(userID);
        newVetoes.splice(newVetoes.indexOf(game.name), 1);
      }
      if (votes.indexOf(game.name) > -1) {
        game.removeVote(userID);
        newVotes.splice(newVotes.indexOf(game.name), 1);
      } else {
        newVotes.push(game.name);
        game.addVote(userID);
      }
    } else {
      if (votes.indexOf(game.name) > -1) {
        game.removeVote(userID);
        newVotes.splice(newVotes.indexOf(game.name), 1);
      }
      if (vetoes.indexOf(game.name) > -1) {
        game.removeVeto(userID);
        newVetoes.splice(newVetoes.indexOf(game.name), 1);
      } else {
        newVetoes.push(game.name);
        game.addVeto(userID);
      }
    }
    this.setState({ savingVotes: true, votes: newVotes, vetoes: newVetoes });
    fetch(`/api/rooms/${roomID}/vote/${userID}`, {
      method: "POST",
      body: JSON.stringify({
        votes: newVotes,
        vetoes: newVetoes
      })
    })
      .then(() => this.setState({ savingVotes: false }))
      .catch((err: Error) => {
        this.setState({ votesError: err, savingVotes: false });
      });
  };

  resetVotes = () => {
    const { roomID } = this.props.match.params;
    this.setState({ savingVotes: true });
    fetch(`/api/rooms/${roomID}/vote/reset`, {
      method: "POST"
    })
      .then(() => this.setState({ savingVotes: false }))
      .catch((err: Error) => {
        this.setState({ votesError: err, savingVotes: false });
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
    this.setState({ selectedFilters: selectedFilters.concat(filter.id) });
  };

  switchGameModal = () => {
    this.setState({
      bggUserModalOpen: !this.state.bggUserModalOpen,
      writeInModalOpen: !this.state.writeInModalOpen
    });
  };

  render() {
    const {
      match: {
        params: { roomID }
      }
    } = this.props;
    const {
      games,
      bggUserModalOpen,
      loadingGames,
      initError,
      selectedFilters,
      filters,
      selectedNumPlayers,
      selectedMaximumPlaytime,
      selectedMinimumPlaytime,
      showMechanics,
      votes,
      vetoes,
      sortBy,
      allVetoes,
      allVotes,
      addingGamesProgress,
      latestGameAdded,
      showVotes,
      introModalOpen,
      writeInModalOpen,
      showGameInfo,
      userID
    } = this.state;
    const progressEl = loadingGames ? (
      <Progress
        className={styles.progress}
        percent={addingGamesProgress * 100}
        precision={0}
        indicating
        progress
        label={latestGameAdded}
      />
    ) : (
      ""
    );
    return (
      <div>
        <IntroModal
          onClose={() => this.setState({ introModalOpen: false })}
          isOpen={introModalOpen}
        />
        <Sidebar.Pushable as={"div"}>
          <Sidebar
            as={Menu}
            animation="overlay"
            icon="labeled"
            vertical
            visible={false}
            width="thin"
          >
            <Menu.Item as="a">
              <Icon name="home" />
              Home
            </Menu.Item>
            <Menu.Item as="a">
              <Icon name="gamepad" />
              Games
            </Menu.Item>
            <Menu.Item as="a">
              <Icon name="camera" />
              Channels
            </Menu.Item>
          </Sidebar>

          <Sidebar.Pusher>
            <Ref
              innerRef={(ref: React.RefObject<HTMLDivElement>) =>
                (this._mainContainer = ref)
              }
            >
              <Container className={styles.roomInfoContainer}>
                <Dropdown text="Menu">
                  <Dropdown.Menu>
                    <Dropdown.Item
                      text="Copy Room URL"
                      onClick={() =>
                        copy(`https://${location.host}/rooms/${roomID}`)
                      }
                    />
                    <Dropdown.Item
                      text="Reset Votes"
                      onClick={this.resetVotes}
                    />
                    <Dropdown.Item
                      text={showGameInfo ? "Hide Game Info" : "Show Game Info"}
                      onClick={() =>
                        this.setState({ showGameInfo: !showGameInfo })
                      }
                    />
                    <Dropdown.Item
                      text="Add Game Without BGG Collection"
                      onClick={() => this.setState({ writeInModalOpen: true })}
                    />
                  </Dropdown.Menu>
                </Dropdown>
                {initError && (
                  <Message negative>
                    <Message.Header>
                      Failed to retrieve current room info
                    </Message.Header>
                    <p>{initError.message}</p>
                  </Message>
                )}
                {bggUserModalOpen && (
                  <AddUserModal
                    switchGameModal={this.switchGameModal}
                    addGames={this.addGames}
                    onClose={() => this.setState({ bggUserModalOpen: false })}
                    roomID={roomID}
                    gamesInRoom={games}
                  />
                )}
                {writeInModalOpen && (
                  <WriteInModal
                    switchGameModal={this.switchGameModal}
                    addGames={this.addGames}
                    onClose={() => this.setState({ writeInModalOpen: false })}
                    roomID={roomID}
                    gamesInRoom={games}
                    userID={userID}
                  />
                )}
                {loadingGames && !bggUserModalOpen ? (
                  <Sticky context={this._mainContainer}>
                    <Segment className={""}>{progressEl}</Segment>
                  </Sticky>
                ) : (
                  ""
                )}
                {!games.hasGames ? (
                  <Segment placeholder>
                    <Header icon>
                      There are no games listed in this room yet.
                    </Header>
                    <Button onClick={this.toggleBggUserModal} primary>
                      Add BGG User Collection
                    </Button>
                  </Segment>
                ) : (
                  ""
                )}
                {games.hasGames ? (
                  <div className={styles.actionRow}>
                    {loadingGames ? (
                      <Popup
                        trigger={
                          <Button disabled>Add BGG User Collection</Button>
                        }
                        content="Can only add one user at a time"
                      />
                    ) : (
                      <Button
                        onClick={this.toggleBggUserModal}
                        primary
                        disabled={loadingGames}
                      >
                        Add BGG User Collection
                      </Button>
                    )}
                    <Dropdown
                      text="Sort by..."
                      value={sortBy}
                      className={styles.sortByDropdown}
                    >
                      <Dropdown.Menu direction="left">
                        <Dropdown.Item
                          value={Sort.AlphaAsc}
                          onClick={() =>
                            this.setState({ sortBy: Sort.AlphaAsc })
                          }
                          text="Alphabetical"
                          icon="caret up"
                        />
                        <Dropdown.Item
                          value={Sort.AlphaDesc}
                          onClick={() =>
                            this.setState({ sortBy: Sort.AlphaDesc })
                          }
                          text="Alphabetical"
                          icon="caret down"
                        />
                        <Dropdown.Item
                          value={Sort.PlaytimeAsc}
                          onClick={() =>
                            this.setState({ sortBy: Sort.PlaytimeAsc })
                          }
                          text="Playtime"
                          icon="caret up"
                        />
                        <Dropdown.Item
                          value={Sort.PlaytimeDesc}
                          onClick={() =>
                            this.setState({ sortBy: Sort.PlaytimeDesc })
                          }
                          text="Playtime"
                          icon="caret down"
                        />
                        <Dropdown.Item
                          value={Sort.VotesDesc}
                          onClick={() =>
                            this.setState({ sortBy: Sort.VotesDesc })
                          }
                          text="Votes"
                          icon="caret down"
                        />
                      </Dropdown.Menu>
                    </Dropdown>
                    <Dropdown
                      className={styles.playerCountDropdown}
                      placeholder="Player Count"
                      text={
                        selectedNumPlayers
                          ? `${selectedNumPlayers} Players`
                          : "Number of players"
                      }
                      clearable={!!selectedNumPlayers}
                      selection
                      options={[1, 2, 3, 4, 5, 6, 7].map(num => {
                        return {
                          text: num + " Players",
                          value: num
                        };
                      })}
                      value={selectedNumPlayers}
                      onChange={this.onPlayerNumberChange}
                    />
                  </div>
                ) : (
                  ""
                )}
                {games.hasGames ? (
                  <div className={styles.actionRow}>
                    <Checkbox
                      label={`Show All User Votes`}
                      checked={showVotes}
                      onChange={() => this.setState({ showVotes: !showVotes })}
                    />
                  </div>
                ) : (
                  ""
                )}
                {games.hasGames ? (
                  <CardGroup
                    className={styles.gameGrid}
                    doubling={true}
                    verticalAlign="middle"
                    itemsPerRow={4}
                    padded
                  >
                    {games
                      .toArray()
                      .sort((a, b) => {
                        function getPlaytime(game: Game) {
                          return (
                            (game.info.maxPlaytime + game.info.minPlaytime) / 2
                          );
                        }
                        switch (sortBy) {
                          default:
                          case Sort.AlphaAsc:
                            return a.name.localeCompare(b.name);
                          case Sort.AlphaDesc:
                            return -a.name.localeCompare(b.name);
                          case Sort.PlaytimeAsc:
                            return getPlaytime(a) - getPlaytime(b);
                          case Sort.PlaytimeDesc:
                            return -getPlaytime(a) + getPlaytime(b);
                          case Sort.VotesDesc:
                            return b.votes.length - a.votes.length;
                        }
                      })
                      .map(game => {
                        const includesFilter =
                          selectedFilters.some(
                            filter =>
                              !!game.info.tags &&
                              game.info.tags.some(tag => tag.id === filter)
                          ) || selectedFilters.length === 0;
                        const inPlayerCount =
                          (game.info.minPlayers <= selectedNumPlayers &&
                            game.info.maxPlayers >= selectedNumPlayers) ||
                          selectedNumPlayers === 0;
                        if (includesFilter && inPlayerCount) {
                          const isVote = votes.indexOf(game.name) > -1;
                          const isVeto = vetoes.indexOf(game.name) > -1;
                          return (
                            <Card>
                              <Card.Content>
                                <a
                                  target="_blank"
                                  href={`https://boardgamegeek.com/boardgame/${
                                    game.id
                                  }`}
                                >
                                  <Image
                                    floated="left"
                                    size="tiny"
                                    src={game.thumbnail}
                                  />
                                </a>
                                <Card.Header as="p">
                                  <a
                                    target="_blank"
                                    href={`https://boardgamegeek.com/boardgame/${
                                      game.id
                                    }`}
                                  >
                                    {game.name}
                                  </a>
                                </Card.Header>
                                {showGameInfo && (
                                  <Card.Description>
                                    <p>
                                      <Icon name="user" />{" "}
                                      {game.info.maxPlayers ===
                                      game.info.minPlayers
                                        ? game.info.minPlayers
                                        : `${game.info.minPlayers} - ${
                                            game.info.maxPlayers
                                          }`}
                                    </p>
                                    <p>
                                      <Icon name="clock" />
                                      {game.info.maxPlaytime ===
                                      game.info.minPlaytime
                                        ? game.info.minPlaytime
                                        : `${game.info.minPlaytime} - ${
                                            game.info.maxPlaytime
                                          }`}
                                    </p>
                                  </Card.Description>
                                )}
                              </Card.Content>
                              <Card.Content extra>
                                <Button.Group floated="right">
                                  <Button
                                    basic={!isVote}
                                    color="green"
                                    icon="arrow up"
                                    size="small"
                                    content={
                                      showVotes ? game.votes.length : undefined
                                    }
                                    onClick={() => this.addVote(game, true)}
                                  />
                                  <Button
                                    basic={!isVeto}
                                    color="red"
                                    icon="arrow down"
                                    size="small"
                                    content={
                                      showVotes ? game.vetoes.length : undefined
                                    }
                                    onClick={() => this.addVote(game, false)}
                                  />
                                </Button.Group>
                              </Card.Content>
                            </Card>
                            // <Grid.Column onClick={() => this.addVote(game)}>
                            //   <div
                            //     className={styles.gameImage}
                            //     style={{
                            //       backgroundImage: `url('${game.thumbnail}')`
                            //     }}
                            //   />
                            //   {/* <Image
                            //       className={styles.gameImage}
                            //       inline
                            //       rounded
                            //       size="small"
                            //       src={game.thumbnail}
                            //       centered
                            //     /> */}
                            //   <div
                            //     className={classnames(
                            //       styles.imageOverlay,
                            //       isVote
                            //         ? styles.green
                            //         : isVeto
                            //         ? styles.red
                            //         : undefined
                            //     )}
                            //   />
                            //   <Icon
                            //     className={styles.voteIcon}
                            //     size="big"
                            //     name={
                            //       isVeto
                            //         ? "remove circle"
                            //         : isVote
                            //         ? "check circle outline"
                            //         : "circle outline"
                            //     }
                            //     color={
                            //       isVote ? "green" : isVeto ? "red" : "black"
                            //     }
                            //   />
                            //   {game.votes.length && showVotes ? (
                            //     <span className={styles.imageVoteOverlay}>
                            //       {game.votes.length}
                            //     </span>
                            //   ) : (
                            //     ""
                            //   )}
                            //   {game.vetoes.length && showVotes ? (
                            //     <span className={styles.imageVetoOverlay}>
                            //       {game.vetoes.length}
                            //     </span>
                            //   ) : (
                            //     ""
                            //   )}
                            // </Grid.Column>
                          );
                        }
                        return false;
                      })}
                  </CardGroup>
                ) : (
                  ""
                )}
              </Container>
            </Ref>
          </Sidebar.Pusher>
        </Sidebar.Pushable>
      </div>
    );
  }
}

export default withRouter(Room);
