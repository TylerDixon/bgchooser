interface GameMap {
  [key: string]: Game;
}

export class GameCollection {
  public games: GameMap = {};

  public hasGames: boolean = false;

  addGames(games: Array<Game>) {
    this.hasGames = true;
    games.forEach(game => {
      if (!this.games[game.name]) {
        this.games[game.name] = new Game(
          game.id,
          game.thumbnail,
          game.name,
          game.info
        );
      }
    });
  }

  toArray(): Array<Game> {
    return Object.keys(this.games).map(key => this.games[key]);
  }

  resetVotes() {
    this.toArray().forEach(game => game.resetVotes());
  }
}

export class Game {
  public thumbnail: string;
  public id: string;
  public name: string;
  public info: GameInfo;
  public votes: Array<string> = [];
  public vetoes: Array<string> = [];

  constructor(id: string, thumbnail: string, name: string, info: GameInfo) {
    this.thumbnail = thumbnail;
    this.name = name;
    this.info = info;
    this.id = id;
  }

  resetVotes() {
    this.votes = [];
    this.vetoes = [];
  }

  addVote(user: string) {
    if (this.votes.indexOf(user) === -1) {
      this.votes.push(user);
    }
  }

  removeVote(user: string) {
    const userIndex = this.votes.indexOf(user);
    if (userIndex > -1) {
      this.votes.splice(userIndex, 1);
    }
  }

  addVeto(user: string) {
    if (this.vetoes.indexOf(user) === -1) {
      this.vetoes.push(user);
    }
  }

  removeVeto(user: string) {
    const userIndex = this.vetoes.indexOf(user);
    if (userIndex > -1) {
      this.vetoes.splice(userIndex, 1);
    }
  }

  handleUser(user: string, votes: Array<string>, vetoes: Array<string>) {
    const userVetoIndex = this.vetoes.indexOf(user);
    const userVoteIndex = this.votes.indexOf(user);
    const gameVoteIndex = votes.indexOf(this.name);
    const gameVetoIndex = vetoes.indexOf(this.name);
    if (gameVoteIndex > -1) {
      if (userVoteIndex === -1) {
        this.votes.push(user);
      }
    } else if (gameVoteIndex === -1) {
      if (userVoteIndex > -1) {
        this.votes.splice(userVoteIndex, 1);
      }
    }
    if (gameVetoIndex > -1) {
      if (userVetoIndex === -1) {
        this.vetoes.push(user);
      }
    } else if (gameVetoIndex === -1) {
      if (userVetoIndex > -1) {
        this.vetoes.splice(userVetoIndex, 1);
      }
    }
  }
}

export interface SubscriptionMessage {
  type: UpdateType;
  games: Array<Game>;
  votes: Array<string>;
  vetoes: Array<string>;
  user: string;
}

export enum UpdateType {
  UpdateTypeAddedGames = "addedGamesUpdate",
  UpdateTypeAddedVotes = "addedVotesUpdate",
  UpdateTypeResetVotes = "resetVotesUpdate"
}

export interface GameInfo {
  minPlayers: number;
  maxPlayers: number;
  minPlaytime: number;
  maxPlaytime: number;
}

export interface BggUserInfo {
  games: Array<Game>;
}

export interface AddGameRes {
  game: Game;
}

export interface AddGamesMessage {
  progress: number;
  game: Game;
  error: string;
  newGame: boolean;
}

export interface RoomInfo {
  games: Array<Game>;
  voteResults: VoteResults;
}

export interface VoteObj {
  [key: string]: Array<string>;
}

export interface VoteResults {
  votes: VoteObj;
  vetoes: VoteObj;
}
