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
    a. Disable capture on the move of a new piece. DONE.
    b. Restrict moves with trails
2. Logic of cutting trails
3. Override moves for pawns
4. When moving a placed piece do not let the dests disappear
 when clicked on a non-reachable square. DONE.

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
            pieceIds: new Map<Key, PieceId>(),
            trailMap: new Map<Key, PieceId>(),
            trails: new Map<PieceId, Trail>(),
            availablePieces: new Map([
                ['black', makeStartingPieces()],
                ['white', makeStartingPieces()],
            ]),
            pieceIdCounter: 0,
            duplicateOnCut: true
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
                move: (orig, dest) => onMove(cg, chess, chesstrailState, orig, dest),
                select: key => onSelect(cg, chess, chesstrailState, key)
            }
        });
        return cg;
    }
};

function onMove(cg, chess, state, orig, dest): void {
    const stage = state.stage;
    if (stage.kind == 'MoveOrPlace' || stage.kind == 'MovePlacedPiece') {
        let trails = getTrailsForMove(cg.state.pieces.get(dest).role, orig, dest);
        if (trails.length > 1) {
            // Disable moves until the trail is chosen.
            cg.set({movable: {dests: new Map()}});
            setStage(state, {kind: 'ChooseTrail', trails});
        } else {
            setStage(state, growTrail(cg, chess, state, orig, trails[0]));
            playOtherSide(cg, chess, state, orig, dest);
        }
    } else {
        debugger;
        alert('Moved during a wrong stage ' + stage.kind)
    }
    drawState(cg, chess, state);
}

function setStage(state, stage) {
    state.stage = stage;
    console.log('set', stage.kind);
}

function deletePiece(cg, chess, state: ChesstrailState, pieceId: PieceId) {
    const trail = state.trails.get(pieceId) as Trail;
    const key = trail[trail.length - 1];
    for (const key of trail) {
        state.trailMap.delete(key);
    }
    state.pieceIds.delete(key);
    state.trails.delete(pieceId);
    cg.state.pieces.delete(key);
    chess.remove(key);
}

// Is called from onmove and on choosing trail. The piece at orig may not exist on the board.
function growTrail(cg, chess, state: ChesstrailState, orig: Key, trail: Key[]): ChesstrailStage {
    const pieceId = state.pieceIds.get(orig) as PieceId;
    const capturedPieceId = state.pieceIds.get(trail[trail.length - 1]);

    if (capturedPieceId) {
        deletePiece(cg, chess, state, capturedPieceId);
    }
    state.pieceIds.delete(orig);
    const dest = trail[trail.length - 1];
    state.pieceIds.set(dest, pieceId);

    const intersectionSquare = trail.slice(1).find(key => state.trailMap.has(key));
    if (intersectionSquare) {
        const intersectedPieceId = state.trailMap.get(intersectionSquare) as PieceId;
        const intersectedTrail = state.trails.get(intersectedPieceId) as Trail;
        const intersectedPiece: Piece = cg.state.pieces.get(intersectedTrail[intersectedTrail.length - 1]);
        const before = intersectedTrail.slice(0, intersectedTrail.indexOf(intersectionSquare));
        const after = intersectedTrail.slice(intersectedTrail.indexOf(intersectionSquare) + 1);
        const isValidBefore = isValidTrail(intersectedPiece.role, before);
        const isValidAfter = isValidTrail(intersectedPiece.role, after);

        if (intersectedPieceId != pieceId) {
            setPieceTrail(state, pieceId, trail);
        }

        if (intersectedPieceId == pieceId) {
            if (capturedPieceId) {
                // If a piece intersected its own path and captured,
                // it must stay on the square where the capture happened.
                // TODO: this does not handle duplication.
                state.trails.set(pieceId, after);
                before.forEach(key => state.trailMap.delete(key));
            } else {
                // A piece can follow in its own trail or intersect it many times.
                // So, we can have more than one trail.
                const trails = splitSelfTrail(intersectedTrail, trail)
                    .filter(t => isValidTrail(intersectedPiece.role, t));

            }
        } else if (isValidBefore && isValidAfter) {
            const playerPieces = state.availablePieces.get(intersectedPiece.color) as Map<Role, Number>;
            const pieceCount = playerPieces.get(intersectedPiece.role) as number;
            if (state.duplicateOnCut && pieceCount > 0) {
                const newPieceId = makeNewPiece(state, intersectedPiece);
                placePiece(cg, chess, state, intersectedPieceId, intersectedPiece, before[before.length - 1]);
                setPieceTrail(state, intersectedPieceId, before);
                placePiece(cg, chess, state, newPieceId, intersectedPiece, after[after.length - 1]);
                setPieceTrail(state, newPieceId, after);
            } else {
                cg.set({movable: {dests: new Map()}});
                // TODO: Delete everything about the piece whose trail needs to be chosen.
                deletePiece(cg, chess, state, intersectedPieceId);
                return {kind: 'ChooseTrail', trails: [before, after]};
            }
        } else if (isValidBefore) {
            state.trails.set(intersectedPieceId, before);
            after.forEach(key => state.trailMap.delete(key));
        } else if (isValidAfter) {
            state.trails.set(intersectedPieceId, after);
            before.forEach(key => state.trailMap.delete(key));
        } else {
            deletePiece(cg, chess, state, intersectedPieceId);
        }
    } else {
        setPieceTrail(state, pieceId, trail);
    }
    return {kind: 'MoveOrPlace'};
}

function splitSelfTrail(oldTrail: Trail, newTrail: Trail): Trail[] {
    const newTrailSet = new Set(newTrail);
    const trails: Trail[] = [];
    let current: Trail = [];
    for (const key of oldTrail) {
        if (newTrailSet.has(key)) {
            if (key == newTrail[0]) {
                // The last square of the old trail, the first square of the new one.
                current.push(...newTrail);
            }
            if (current.length) {
                trails.push(current);
                current = [];
            }
        } else {
            current.push(key);
        }
    }
    if (current.length) {
        trails.push(current);
    }
    return trails;
}

function validateState(cg, chess, state: ChesstrailState) {
    let assert = (msg, isGood) => {
        if (!isGood) {
            throw new Error(msg)
        }
    };
    let setEq = (s1, s2) => s1.size === s2.size && [...s1].every(x => s2.has(x));
    const pieceIdSet = new Set(state.pieceIds.values());
    // chess fen is longer - it includes turn
    assert('Chess positions in cg and chess correspond', chess.fen().startsWith(cg.getFen()));
    assert('Each key has a unique pieceId', pieceIdSet.size == state.pieceIds.size);
    assert('PieceIds and trails correspond', setEq(pieceIdSet, new Set(state.trails.keys())));

    [...state.pieceIds.entries()].every(([key, pieceId]) => {
        const trail = state.trails.get(pieceId) as Trail;
        assert(`PieceId ${pieceId} is at the key at the end its trail`, trail[trail.length - 1] == key);
    });
    assert('trailMap has correct pieceIds', setEq(pieceIdSet, new Set(state.trailMap.values())));
    // Together these checks also ensure that trailMap has no entries that are not in trails
    state.trails.forEach((trail, pieceId) => {
        assert(`Trail for pieceId ${pieceId} has unique keys`, trail.length == (new Set(trail)).size);
        // This check also ensures that trails do not overlap
        assert(`Trail for pieceId ${pieceId} is in trailMap`, trail.every(key => state.trailMap.get(key) == pieceId));
        for (let i = 0; i < trail.length - 1; i++) {
            const [x1, y1] = key2pos(trail[i]);
            const [x2, y2] = key2pos(trail[i + 1]);
            assert(`Trail for pieceId ${pieceId} must consist of adjacent squares`,
                Math.abs(x1 - x2) <= 1 && Math.abs(y1 - y2) <= 1);
        }
    });

    assert(`TrailMap has tracks the same number of keys as trails`,
        state.trailMap.size == [...state.trails.values()].reduce((acc, t) => acc + t.length, 0));
}

function setPieceTrail(state, pieceId, trail) {
    for (const key of trail) {
        state.trailMap.set(key, pieceId)
    }

    let pieceTrail = state.trails.get(pieceId);
    if (!pieceTrail) {
        state.trails.set(pieceId, trail);
    } else {
        const newSquares = trail.slice(1);
        pieceTrail.push(...newSquares);
    }
}

function isValidTrail(role: Role, trail: Trail): boolean {
    if (role == 'knight') {
        if (trail.length >= 4) {
            const [x1, y1] = key2pos(trail[trail.length - 4]);
            const [x2, y2] = key2pos(trail[trail.length - 1]);
            return Math.abs(x1 - x2) == 1 && Math.abs(y1 - y2) == 2
                || Math.abs(x1 - x2) == 2 && Math.abs(y1 - y2) == 1
        }
        return false;
    } else {
        // for the other pieces any trail longer than the current square is fine
        return trail.length > 1;
    }
}

function getTrailsForMove(role: Role, orig, dest): Trail[] {
    // Knight can have two trails for the same move.
    if (role == 'knight') {
        const [x1, y1] = key2pos(orig),
            [x2, y2] = key2pos(dest);
        return [
            expandTrail([orig, pos2key([x1, y2]), dest]),
            expandTrail([orig, pos2key([x2, y1]), dest])];
    } else {
        return [expandTrail([orig, dest])];
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
    availablePieces: Map<Color, Map<Role, Number>>
    // This tracks trails of the pieces on board. It is in sync with the state.pieces
    pieceIds: Map<Key, PieceId>
    // trails and trailMap describe the same structure. They must be in sync.
    trails: Map<PieceId, Trail>
    trailMap: Map<Key, PieceId>
    pieceIdCounter: number
    stage: ChesstrailStage
    duplicateOnCut: boolean
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


function placePiece(cg, chess, state: ChesstrailState, pieceId: PieceId, piece: Piece, key: Key) {
    cg.state.pieces.set('a0', piece);
    // dropNewPiece changes color. Restore it.
    dropNewPiece(cg.state, 'a0', key, true);
    cg.state.turnColor = piece.color;
    chess.put({type: letters[piece.role], color: piece.color[0]}, key);
    state.pieceIds.set(key, pieceId);
}

function makeNewPiece(state, piece: Piece): PieceId {
    const playerPieces = state.availablePieces.get(piece.color) as Map<Role, Number>;
    const pieceCount = playerPieces.get(piece.role) as number;
    playerPieces.set(piece.role, pieceCount - 1);
    return state.pieceIdCounter++;
}

function onSelect(cg, chess, state: ChesstrailState, key: Key) {
    const color = cg.state.turnColor;
    const stage = state.stage;

    if (stage.kind == 'MoveOrPlace') {
        if (state.trailMap.has(key)) {
            // Cannot place on a square that has a piece or trail of another piece.
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
            placePiece(cg, chess, state, makeNewPiece(state, chosenPiece), chosenPiece, stage.placeAt);
            const dests = new Map([[stage.placeAt, getMoves(cg, chess, state, stage.placeAt, false)]]);
            cg.set({movable: {dests: dests}});
            cg.selectSquare(stage.placeAt);
            setStage(state, {
                kind: 'MovePlacedPiece',
                placedAt: stage.placeAt
            });
        } else if (!state.trailMap.has(key)) {
            const availablePieces = state.availablePieces.get(color) as Map<Role, Number>;
            // Place on another square
            setStage(state, {
                kind: 'Place',
                choicePieces: placeChoicePieces(key, color, availablePieces),
                placeAt: key
            });
        } else {
            // A player can change their mind and move instead of placing.
            setStage(state, {kind: 'MoveOrPlace'});
        }
    } else if (stage.kind == 'MovePlacedPiece') {
        if (cg.state.selected != key && cg.state.movable.dests && !cg.state.movable.dests.get(stage.placedAt).includes(key)) {
            // Dests become undefined after move.
            cg.selectSquare(stage.placedAt);
        }
    } else if (stage.kind == 'ChooseTrail') {
        const trailsWithKey = stage.trails
            .map(t => t.includes(key));
        const trailIndex = trailsWithKey.indexOf(true);
        if (trailIndex == -1 || trailsWithKey.indexOf(true, trailIndex + 1) != -1) {
            // Not found or not unique
            return;
        }
        const trail = stage.trails[trailIndex];
        playOtherSide(cg, chess, state, trail[0], trail[trail.length - 1]);
        setStage(state, growTrail(cg, chess, state, trail[0], trail));
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
        let x = x1, y = y1;
        do {
            x += xDelta;
            y += yDelta;
            path.push(pos2key([x, y]));
        } while (x != x2 || y != y2)
    }
    return path;
}

function drawState(cg, chess, state: ChesstrailState) {
    validateState(cg, chess, state);
    console.log(chess.ascii());
    console.log(cg.state.turnColor);
    console.log(state.stage.kind);
    console.log('pieceIds', JSON.stringify([...state.pieceIds]));
    console.log('trailMap', JSON.stringify([...state.trailMap]));
    console.log('trails', JSON.stringify([...state.trails]));
    const shapes: DrawShape[] = drawTrails(cg, state.trails);
    if (state.stage.kind == 'Place') {
        shapes.push(...displayChoice(state.stage.choicePieces));
    } else if (state.stage.kind == 'ChooseTrail') {
        state.stage.trails.forEach(trail =>
            shapes.push(...drawTrail('paleGreen', trail)));
    }
    // shapes.push({ orig: 'e2', dest: 'a8', brush: 'black'});
    cg.setAutoShapes(shapes);
}

function drawTrails(cg, trails: Map<PieceId, Trail>): DrawShape[] {
    const shapes: DrawShape[] = [];
    for (const trail of trails.values()) {
        const position = trail[trail.length - 1];
        const {color} = cg.state.pieces.get(position);
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

function getMoves(cg, chess, state, key: Key, allowCapture: boolean = true): Key[] {
    // TODO: limit moves with trails.
    let isValidTrail = trail => {
        // Trail is valid if:
        // If a piece is captured, its trail is ignored in the rules below.
        // A new trail cuts an existing trail when they share one common square.
        // Trail cannot cut more than one trail of a piece, including its own.
        // Trail cannot follow overlap with the trail of another piece.
        // New trail of a piece can overlap with its own trail.
        // A piece can cut its own trail only once too.
        const dest = trail[trail.length - 1];
        const selfPieceId = state.pieceIds.get(key);
        const capturedPieceId = state.pieceIds.get(dest);
        let cuttingTrailOfAnotherPiece = null;
        for (const s of trail) {
            const trailOnSquare = state.trailMap.get(s);
            if (!trailOnSquare) continue;
            const pieceId = trailOnSquare[0];
            if (pieceId == capturedPieceId) continue;
            if (pieceId == selfPieceId) throw new Error('what should i do');
            if (cuttingTrailOfAnotherPiece == null) cuttingTrailOfAnotherPiece = pieceId;
            if (cuttingTrailOfAnotherPiece != null) return false;
        }
        return true;
    };
    const piece = cg.state.pieces.get(key);
    const ms = chess.moves({square: key, verbose: true, legal: false})
        .filter(m => allowCapture || m.captured == undefined)
        .filter(m => getTrailsForMove(piece.role, key, m.to).some(isValidTrail))
        .map(m => m.to);
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
        // TODO: this happens when chess considers the move illegal.
        alert('chess rejected move');
        chess.put(chess.remove(orig), dest);
    }
    cg.set({
        turnColor: toColor(chess),
        movable: {
            color: toColor(chess),
            dests: getAllMoves(cg, chess, state)
        }
    });
}

function getAllMoves(cg, chess: any, state: ChesstrailState): Map<Key, Key[]> {
    const dests = new Map();
    for (const s of cg.state.pieces.keys()) {
        const moves = getMoves(cg, chess, state, s);
        if (moves.length) dests.set(s, moves);
    }
    return dests;
}
