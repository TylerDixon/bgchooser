import React, { Component } from "react";
import { RouteComponentProps, Redirect, withRouter } from "react-router";
import { Button } from "semantic-ui-react";

class GetRoom extends Component<RouteComponentProps, any> {
  state = {
    roomID: ""
  };

  getRoom = () => {
    fetch("/api/rooms", {
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
        <Button onClick={this.getRoom}>Open Room</Button>
      </div>
    );
  }
}

export default withRouter(GetRoom);
