interface OverwolfGame {
  id: string;
}

type GameData = {
  gameId: OverwolfGame['id'];
};

const game = { id: 123 };
const gameId = game['id'];
