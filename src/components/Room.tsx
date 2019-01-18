import React, { Component, ChangeEvent } from "react";
import _ from "lodash";
import { withRouter } from "react-router-dom";
import { RouteComponentProps } from "react-router";

interface RoomState {
  bggUser: string;
  games: Array<string>;
  bggUserModalOpen: boolean;
}

interface RoomRouteParams {
  roomID: string;
}

class Room extends Component<RouteComponentProps<RoomRouteParams>, RoomState> {
  state = {
    bggUser: "",
    games: [],
    bggUserModalOpen: false
  };

  toggleBggUserModal = () => {
    this.setState({ bggUserModalOpen: !this.state.bggUserModalOpen });
  };

  onUpdateBggUser = (e: ChangeEvent<HTMLElement>) => {
    let element = e.currentTarget as HTMLInputElement;
    this.setState({ bggUser: element.value });
  };

  getBggUser = () => {
    const { roomID } = this.props.match.params;
    const { bggUser } = this.state;
    fetch(`http://localhost:8000/rooms/${roomID}/add/${bggUser}`, {
      method: "POST"
    })
      .then(res => res.json())
      .then(res => {
        const { games } = this.state;
        this.setState({ games: _.union(games, res.games) });
      });
  };

  render() {
    const {
      match: {
        params: { roomID }
      }
    } = this.props;
    const { bggUser, games } = this.state;
    return (
      <div>
        {roomID}
        <input name="bggUser" value={bggUser} onChange={this.onUpdateBggUser} />
        {games}
        <button onClick={this.getBggUser}>Get BGG User</button>
      </div>
    );
  }
}

export default withRouter(Room);
