import React, { Component, ChangeEvent } from "react";
import { RouteComponentProps, Redirect, withRouter } from "react-router";
import { Button, Input, Divider, Message, Container } from "semantic-ui-react";
import styles from "./room.module.scss";

class GetRoom extends Component<RouteComponentProps, any> {
  state = {
    roomID: "",
    tempRoomID: "",
    roomIDError: ""
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

  onTempRoomIDChange = (e: ChangeEvent<HTMLElement>) => {
    let element = e.currentTarget as HTMLInputElement;
    let roomIDError = "";
    if (!/^[0-9]{5}$/.test(element.value)) {
      roomIDError =
        "Room ID must be a 5 digit number. This could be supplied by whoever created the room.";
    }
    this.setState({ tempRoomID: element.value, roomIDError });
  };

  changeRoomID = () => {
    this.setState({ roomID: this.state.tempRoomID });
  };

  render() {
    const { roomID, tempRoomID, roomIDError } = this.state;
    return (
      <Container textAlign="center" className={styles.roomInfoContainer}>
        <p>
          Welcome to BG Chooser! If you are here for the first time, click "New
          Room" below to create a new room for users to vote. If you've been
          sent here by someone else, they should have also supplied you with a
          Room ID. Enter that in the input below to go to that room.
        </p>
        {roomID && <Redirect to={{ pathname: `/rooms/${roomID}` }} />}
        <Button
          color="teal"
          content="New Room"
          icon="add"
          labelPosition="left"
          onClick={this.getRoom}
        />
        <Divider horizontal>Or</Divider>
        <Input
          value={tempRoomID}
          onChange={this.onTempRoomIDChange}
          action={{
            color: "blue",
            content: "Go To Room",
            onClick: this.changeRoomID
          }}
          icon="search"
          iconPosition="left"
          placeholder="Room ID"
        />

        {roomIDError && (
          <Message negative>
            <p>{roomIDError}</p>
          </Message>
        )}
      </Container>
    );
  }
}

export default withRouter(GetRoom);
