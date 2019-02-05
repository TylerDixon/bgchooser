import React from "react";
import { Modal, Icon } from "semantic-ui-react";
import classnames from "classnames";
import styles from "./intromodal.module.scss";

const viticulturePreviewImage =
  "https://cf.geekdo-images.com/thumb/img/sD_qvrzIbvfobJj0ZDAaq-TnQPs=/fit-in/200x150/pic2649952.jpg";

interface IntroModalProps {
  onClose: () => void;
  isOpen: boolean;
}

interface IntroModalState {
  shouldAnimate: boolean;
}

class IntroModal extends React.Component<IntroModalProps, IntroModalState> {
  state: IntroModalState = {
    shouldAnimate: true
  };

  componentDidMount = () => {
    requestAnimationFrame(() => this.setState({ shouldAnimate: true }));
  };
  render() {
    const { isOpen, onClose } = this.props;
    const { shouldAnimate } = this.state;
    return (
      <Modal
        open={isOpen}
        onClose={onClose}
        className={styles.introModal}
        closeIcon
      >
        <Modal.Header>Add a BGG User</Modal.Header>
        <Modal.Content>
          <Modal.Description>
            <p>
              Welcome to BG Chooser! You've been sent this link to probably vote
              on a set of board games. You can add more games via BoardGameGeek
              usernames. You can also filter through the games in this room by
              player count and sort games through various parameters.
            </p>
            <div className={styles.animationContainer}>
              <div className={styles.imageContainer}>
                <img
                  className={styles.imagePreview}
                  src={viticulturePreviewImage}
                  alt="How to vote preview iamge"
                />
                <div className={shouldAnimate ? styles.imageOverlay : ""} />
                <Icon
                  className={classnames(
                    styles.icon,
                    shouldAnimate ? styles.middleIcon : ""
                  )}
                  name="circle outline"
                />
                <Icon
                  className={shouldAnimate ? styles.pointerIcon : ""}
                  name="hand point left"
                />
              </div>
            </div>
            <Icon />
            <p className={styles.voteDescription}>
              To vote on games, click it's corresponding image once to{" "}
              <span className={styles.yesVote}>vote yes</span>, click again to{" "}
              <span className={styles.veto}>veto</span>, and click again to{" "}
              <span className={styles.undoVote}>undo your vote</span>.
            </p>
          </Modal.Description>
        </Modal.Content>
        <Modal.Actions actions={["Got it!"]} onClick={onClose} />
      </Modal>
    );
  }
}
export default IntroModal;
