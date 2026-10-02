/**
 * Game 1 local puzzle data.
 *
 * Temporary prototype data. A future backend can return the same shape.
 */
export const GAME1_ID = "game1";

export const game1Puzzle = {
  date: "2026-10-02",
  game: GAME1_ID,
  answer: "APPLE",
  clues: [
    "It is a fruit.",
    "It can be red, green, or yellow.",
    "It is commonly used in pies.",
    "Its name begins with A.",
    "It has five letters."
  ],
  status: "published"
};

export const VALID_GUESS_WORDS = [
  "APPLE","HOUSE","CHAIR","BRAVE","CLOUD","GRAPE","PLANT","STONE",
  "TRAIN","WATER","LIGHT","MOUSE","TABLE","SMILE","WORLD","BRAIN",
  "SHEEP","GREEN","HEART","SUGAR","PAPER","PHONE","RIVER","SOUND",
  "SWEET","BLACK","WHITE","LEMON","PEACH","MANGO","BREAD","CANDY",
  "DREAM","EARTH","FRUIT"
];

export const ANSWER_WORDS = ["APPLE","HOUSE","CHAIR","GRAPE","PLANT"];
