import React, { Component } from "react";
import { BrowserRouter as Router, Route, withRouter } from "react-router-dom";
import GetRoom from "./GetRoom";
import Room from "./Room";
import styles from "./app.module.scss";

interface AppState {
  roomID: string;
}

class App extends Component<any, AppState> {
  render() {
    return (
      <div className={styles.app}>
        <Router>
          <div>
            <Route path="/" exact component={GetRoom} />
            <Route path="/rooms/:roomID" exact component={Room} />
          </div>
        </Router>
      </div>
    );
  }
}

export default App;
