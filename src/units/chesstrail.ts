import {Chess} from 'chess.js';
import {Chessground} from 'chessground';
import {Unit} from './unit';
import {DrawShape} from 'chessground/draw';
import {Api} from 'chessground/api';
import {key2pos, pos2key} from 'chessground/util';
import {Key, Color, Role, Piece} from 'chessground/types';
import {dropNewPiece} from 'chessground/board';

/*
TODO:
1. Move filtering
    a. Disable capture on the move of a new piece
    b. Restrict moves with trails
2. Logic of cutting trails
3. Override moves for pawns

 */

export const defaults: Unit = {
    name: 'Chesstrail',
    run(el) {
        const chess = new Chess();
        chess.clear();
        let chesstrailState: ChesstrailState = {
            stage: {
                kind: 'MoveOrPlace'
            },
            availablePieces: new Map([
                ['black', makeStartingPieces()],
                ['white', makeStartingPieces()],
            ]),
            trails: new Map()
        };
        const cg = Chessground(el, {
            fen: chess.fen(),
            movable: {
                color: 'white',
                free: false
            },
            premovable: {
                enabled: false
            },
            drawable: {
                brushes: {
                    // @ts-ignore
                    'white': {key: 'w', color: 'white', opacity: 1, lineWidth: 10},
                    'black': {key: 'k', color: 'black', opacity: 1, lineWidth: 10}
                }
            },
            draggable: {
                showGhost: true
            }
        });

        cg.set({
            events: {
                move: (orig, dest, capturedPiece) => {
                    onMove(cg, chess, chesstrailState, orig, dest,capturedPiece);
                },
                select: key => {
                    onSelect(cg, chess, chesstrailState, key);
                }
            }
        });
        return cg;
    }
};

function onMove(cg, chess, state, orig, dest, capturedPiece): void {
    const stage = state.stage;
    if (stage.kind == 'MoveOrPlace' || stage.kind == 'MovePlacedPiece') {
        let trails = getTrailsForMove(cg, state, orig, dest);
        if (trails.length > 1) {
            // Disable moves until the trail is chosen.
            cg.set({
                movable: {
                    dests: new Map()
                }
            });
            setStage(state, {
                kind: 'ChooseTrail',
                trails
            });
        } else {
            growTrail(cg, state, trails[0]);
            playOtherSide(cg, chess, state, orig, dest);
            setStage(state, {
                kind: 'MoveOrPlace',
            });
        }
    } else {
        debugger;
        alert('Moved during a wrong stage ' + stage.kind)
    }
    drawState(cg, chess, state);
}

function setStage(state, stage) {
    state.stage = stage;
    console.log(stage.kind);
}

function growTrail(cg, state, trail) {
    const head = trail[0];
    let pieceTrail = state.trails.get(head);
    if (pieceTrail) {
        // TODO: check for cutting piece's own trail
        const tail = trail.slice(1);
        pieceTrail.push(...tail);
        state.trails.delete(head);
    } else {
        pieceTrail = trail;
    }
    // The trail of the captured piece square is overwritten by the trail of capturing piece.
    // So capturing is not a special case.
    const last = trail[trail.length - 1];
    state.trails.set(last, pieceTrail);
}

function getTrailsForMove(cg, state, orig, dest): Trail[] {
    // Knight can have two trails for the same move.
    const piece = cg.state.pieces.get(dest);
    if (piece.role == 'knight') {
        const [x1, y1] = key2pos(orig),
            [x2, y2] = key2pos(dest);
        return [[orig, pos2key([x1, y2]), dest], [orig, pos2key([x2, y1]), dest]];
    } else {
        return [[orig, dest]];
    }
}

const makeStartingPieces = () => new Map<Role, Number>([
    ['queen', 1],
    ['rook', 2],
    ['bishop', 2],
    ['knight', 2],
    ['pawn', 8]
]);

type ChesstrailState = {
    availablePieces: Map<Color, Map<Role, Number>>,
    // This tracks trails of the pieces on board. It is in sync with the state.pieces
    trails: Map<Key, Trail>,
    pieceIds: Map<Key, PieceId>
    trailMap: Map<Key, [PieceId, Number]>
    stage: ChesstrailStage
}

type PieceId = Number

interface ChesstrailStageMoveOrPlace {
    kind: 'MoveOrPlace'
}

interface ChesstrailStagePlace {
    kind: 'Place',
    placeAt: Key,
    choicePieces: Map<Key, Piece>
}

interface ChesstrailStageMovePlacedPiece {
    kind: 'MovePlacedPiece',
    placedAt: Key
}

interface ChesstrailStageChooseTrail {
    kind: 'ChooseTrail',
    trails: Trail[]
}

type ChesstrailStage = ChesstrailStageMoveOrPlace
    | ChesstrailStagePlace
    | ChesstrailStageMovePlacedPiece
    | ChesstrailStageChooseTrail


function onSelect(cg, chess, state: ChesstrailState, key: Key): void {
    const color = cg.state.turnColor;
    const stage = state.stage;

    const isSquareFree = !cg.state.pieces.has(key);

    if (stage.kind == 'MoveOrPlace') {
        if (!isSquareFree) {
            // There are two clicks when moving: on the first one the square has a piece
            // On the second one, this listener is called when the piece is already moved there.
            return;
        }

        const availablePieces = state.availablePieces.get(color) as Map<Role, Number>;
        const choicePieces = placeChoicePieces(key, color, availablePieces);

        setStage(state, {
            kind: 'Place',
            choicePieces,
            placeAt: key
        });
    } else if (stage.kind == 'Place') {
        const chosenPiece = stage.choicePieces.get(key);
        if (chosenPiece) {
            cg.state.pieces.set('a0', chosenPiece);
            // dropNewPiece changes color. Restore it.
            dropNewPiece(cg.state, 'a0', stage.placeAt);
            cg.state.turnColor = color;
            chess.put({type: letters[chosenPiece.role], color: chosenPiece.color[0]}, stage.placeAt);
            const dests = new Map([[stage.placeAt, getMoves(cg, chess, state, stage.placeAt, false)]]);
            cg.set({
                movable: {
                    dests: dests
                }
            });
            cg.selectSquare(stage.placeAt);
            setStage(state, {
                kind: 'MovePlacedPiece',
                placedAt: stage.placeAt
            });
        } else {
            if (isSquareFree) {
                const availablePieces = state.availablePieces.get(color) as Map<Role, Number>;
                // Place on another square
                setStage(state, {
                    kind: 'Place',
                    choicePieces: placeChoicePieces(key, color, availablePieces),
                    placeAt: key
                });
            } else {
                setStage(state, {
                    kind: 'MoveOrPlace'
                });
            }
        }
    } else if (stage.kind == 'ChooseTrail') {
        const trailsWithKey = stage.trails
            .map(t => expandTrail(t).includes(key));
        const trailIndex = trailsWithKey.indexOf(true);
        if (trailIndex == -1 || trailsWithKey.indexOf(true, trailIndex + 1) != -1) {
            // Not found or not unique
            return;
        }
        const trail = stage.trails[trailIndex];
        playOtherSide(cg, chess, state, trail[0], trail[trail.length - 1]);
        growTrail(cg, state, trail);
        setStage(state, {
            kind: 'MoveOrPlace'
        });
    }
    drawState(cg, chess, state);
}

function expandTrail(trail: Trail): Key[] {
    // Makes a sequence of adjacent keys
    // The knight path is split in two straight segments, so
    // a trail can only have straight or diagonal segments.
    const path: Key[] = [trail[0]];
    for (let i = 0; i < trail.length - 1; i++) {
        const [x1, y1] = key2pos(trail[i]);
        const [x2, y2] = key2pos(trail[i + 1]);
        const xDelta = Math.sign(x2 - x1); // +1, -1, 0
        const yDelta = Math.sign(y2 - y1); // +1, -1, 0
        // This loop will hang if the segments aren't straight or diagonal.
        for (let x = x1, y = y1; x != x2 || y != y2; x += xDelta, y += yDelta) {
            path.push(pos2key([x, y]));
        }
    }
    return path;
}

function drawState(cg, chess, state: ChesstrailState) {
    console.log(chess.ascii());
    console.log(cg.state.turnColor);
    console.log(state.stage.kind);
    const shapes = drawTrails(cg, state.trails);
    if (state.stage.kind == 'Place') {
        shapes.push(...displayChoice(state.stage.choicePieces));
    } else if (state.stage.kind == 'ChooseTrail') {
        state.stage.trails.forEach(trail =>
            shapes.push(...drawTrail('paleGreen', trail)));
    }
    // shapes.push({ orig: 'e2', dest: 'a8', brush: 'black'});
    cg.setAutoShapes(shapes);
}

function drawTrails(cg, trails: Map<Key, Trail>): DrawShape[] {
    const shapes: DrawShape[] = [];
    for (const [key, trail] of trails) {
        const {color} = cg.state.pieces.get(key);
        shapes.push(...drawTrail(color, trail));
    }
    return shapes;
}

function drawTrail(brush: string, trail: Trail): DrawShape[] {
    const shapes: DrawShape[] = [];
    for (let i = 0; i < trail.length - 1; i++) {
        shapes.push({orig: trail[i], dest: trail[i + 1], brush});
    }
    return shapes;
}

function getMoves(cg, chess, state, key: Key, allowCapture?: boolean=true): Key[] {
    // TODO: limit moves with trails.
    const ms = chess.moves({square: key, verbose: true, legal: false}).map(m => m.to);
    return ms;
}

function placeChoicePieces(key: Key, color: Color, pieces: Map<Role, Number>): Map<Key, Piece> {
    const availablePieces = getAvailablePieces(pieces);
    const rank = Number(key[1]);
    const file = key[0];
    const startingRank = Math.max(1, rank - availablePieces.length + 1);
    return new Map(availablePieces.map((role, i) =>
        [file + (startingRank + i) as Key, {role, color}]
    ));
}

function displayChoice(pieces: Map<Key, Piece>): DrawShape[] {
    const shapes: DrawShape[] = [];
    pieces.forEach((piece, key) => shapes.push({
        orig: key,
        piece: piece
    }));
    return shapes;
}

function getAvailablePieces(pieces: Map<Role, Number>): Role[] {
    const availablePieces: Role[] = [];
    for (const [piece, num] of pieces) {
        if (num > 0) {
            availablePieces.push(piece);
        }
    }
    return availablePieces;
}

type Trail = Key[];
// type PiecesTrails = Map<Key, Trail>;


// function trailsToShapes(trails: PiecesTrails): DrawShape[] {
//   return [{ orig: 'e2', dest: 'e4', brush: 'green' }];
// }

const letters = {
    pawn: 'p',
    rook: 'r',
    knight: 'n',
    bishop: 'b',
    queen: 'q',
    king: 'k',
};

export function toColor(chess: any): Color {
    return (chess.turn() === 'w') ? 'white' : 'black';
}

function playOtherSide(cg: Api, chess, state: ChesstrailState, orig, dest) {
    const move = chess.move({from: orig, to: dest});
    if (!move) {
        alert('chess rejected move');
    }
    cg.set({
        turnColor: toColor(chess),
        movable: {
            color: toColor(chess),
            dests: toDests(cg, chess, state)
        }
    });
}

function toDests(cg, chess: any, state: ChesstrailState): Map<Key, Key[]> {
    const dests = new Map();
    for (const s of cg.state.pieces.keys()) {
        const moves = getMoves(cg, chess, state, s);
        if (moves.length) dests.set(s, moves);
    }
    return dests;
}
