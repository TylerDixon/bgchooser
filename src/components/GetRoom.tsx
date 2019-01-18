import React, { Component } from "react";
import { RouteComponentProps, Redirect, withRouter } from "react-router";

class GetRoom extends Component<RouteComponentProps, any> {
  state = {
    roomID: ""
  };

  getRoom = () => {
    fetch("http://localhost:8000/rooms", {
      method: "POST"
    })
      .then(res => res.json())
      .then(res => {
        this.setState({ roomID: res.roomID });
      });
  };

  render() {
    const { roomID } = this.state;
    return (
      <div>
        {roomID && <Redirect to={{ pathname: `/rooms/${roomID}` }} />}
        <button onClick={this.getRoom}>Open Room</button>
      </div>
    );
  }
}

export default withRouter(GetRoom);
