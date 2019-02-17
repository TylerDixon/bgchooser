import React, { Component, ChangeEvent } from "react";
import { RouteComponentProps, Redirect, withRouter } from "react-router";
import {
  Button,
  Divider,
  Message,
  Container,
  Segment,
  Header,
  Card,
  Image,
  CardGroup
} from "semantic-ui-react";
import styles from "./room.module.scss";
import s1 from "../images/s1.png";
import s2 from "../images/s2.png";
import s25 from "../images/s25.png";
import s3 from "../images/s3.png";

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
        "Vote ID must be a 5 digit number. This could be supplied by whoever created the room.";
    }
    this.setState({ tempRoomID: element.value, roomIDError });
  };

  changeRoomID = () => {
    this.setState({ roomID: this.state.tempRoomID });
  };

  render() {
    const { roomID, tempRoomID, roomIDError } = this.state;
    return (
      <div>
        <Segment vertical textAlign="center">
          <Header as="h1">BG Chooser</Header>
        </Segment>
        <Container textAlign="center" className={styles.roomInfoContainer}>
          <p>
            Welcome to BG Chooser! Click "New Vote" below to create a new vote
            to send to others. From there, copy the URL and send to others to
            vote.
          </p>
          {roomID && <Redirect to={{ pathname: `/rooms/${roomID}` }} />}
          <Button
            color="teal"
            content="New Vote"
            icon="add"
            labelPosition="left"
            onClick={this.getRoom}
          />

          {roomIDError && (
            <Message negative>
              <p>{roomIDError}</p>
            </Message>
          )}
        </Container>
        <Divider />
        <Header as="h2" textAlign="center" style={{ "font-size": "1.4em" }}>
          How it works
        </Header>
        <CardGroup columns={4} centered>
          <Card>
            <Image src={s1} />
            <Card.Content>1. Create a new vote</Card.Content>
          </Card>
          <Card>
            <Image src={s25} />
            <Card.Content>2. Enter BGG User to get collection</Card.Content>
          </Card>
          <Card>
            <Image src={s2} />
            <Card.Content>
              3. Add some, or all of your games to the vote
            </Card.Content>
          </Card>
          <Card>
            <Image src={s3} />
            <Card.Content>4. Send out the link and vote on games!</Card.Content>
          </Card>
        </CardGroup>
      </div>
    );
  }
}

export default withRouter(GetRoom);
