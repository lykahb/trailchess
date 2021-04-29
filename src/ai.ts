import {dropNewPiece} from "chessground/board";
import {Color, Key, Piece, Role} from "chessground/types";
import {opposite} from 'chessground/util';
import {TrailChessState, getMoves, setPieceTrail, Move, Trail, validateState} from "./trailchess"

function roleValue(role: Role): number {
    return {
        'pawn': 1,
        'knight': 3,
        'bishop': 3,
        'rook': 5,
        'queen': 9
    } [role];
}

function pickRandom<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}

function shuffleArray<T>(array: T[]) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}

function computeMoveWeight(color: Color, opponentAttacks: Set<Key>, isPlaced: boolean, oldTrail: Trail, move: Move): number {
    let weight = 0;
    const piece = move.piece;
    const orig = move.trail[0];
    const dest = move.trail[move.trail.length - 1];
    if (move.captures) {
        weight += roleValue(move.captures.piece.role) * 11;
    }

    const [origAttacked, destAttacked] = [opponentAttacks.has(orig), opponentAttacks.has(dest)];
    if ((isPlaced || !origAttacked) && destAttacked) {
        weight -= roleValue(piece.role) * 10;
    } else if (!isPlaced && origAttacked && !destAttacked) {
        weight += roleValue(piece.role) * 10;
    }

    if (!destAttacked) {
        if (piece.role == 'pawn' && oldTrail.length > 3) {
            // Pawn move should have more weight as it approaches the edge.
            // The past trail length approximates it.
            weight += oldTrail.length + 1;
        } else {
            weight += move.trail.length / 2;
        }
    }

    if (move.cuts) {
        const weightSign = move.cuts.piece.color === color ? -1 : 1;
        if (move.cuts.isErased) {
            weight += weightSign * 10 * roleValue(move.cuts.piece.role);
        } else {
            weight += weightSign * 5;
        }
    }
    return weight;
}

function getAttackedSquares(state: TrailChessState, attackerColor: Color): Set<Key> {
    const attackedSquares: Set<Key> = new Set();
    const mapAfterMove = state.stage.kind == 'MovePlacedPiece' ? state.stage.movesMapBackup : state.movesMap;
    if (!mapAfterMove) return attackedSquares;

    for (const [s, moves] of mapAfterMove) {
        if (state.cg.state.pieces.get(s)?.color !== attackerColor) continue;
        for (const move of moves) {
            attackedSquares.add(move.trail[move.trail.length - 1]);
        }
    }
    return attackedSquares;
}

function getWeightedMoves(state: TrailChessState, random: boolean): Weighted<{ move: Move }>[] {
    if (!state.movesMap || state.movesMap.size == 0) return [];
    if (random) {
        const moves = pickRandom([...state.movesMap.values()]);
        const move = pickRandom(moves);
        return [{move, weight: 0}]
    }

    const opponentAttacks = getAttackedSquares(state, opposite(state.color));
    const weightedMoves: { move: Move, weight: number }[] = [];
    for (const moves of state.movesMap.values()) {
        const {pieceId, piece} = moves[0];
        const trail = state.trails.get(pieceId)!;
        if (piece.color !== state.color) continue;
        for (const move of moves) {
            const weight = computeMoveWeight(state.color, opponentAttacks, false, trail, move);
            weightedMoves.push({move, weight});
        }
    }
    return weightedMoves;
}

type Weighted<T> = { weight: number } & T;

function sortWeights<T>(arr: Weighted<T>[]): Weighted<T>[] {
    return arr.sort((a, b) => b.weight - a.weight);
}

function bestTrailChoice(state: TrailChessState): Trail {
    const stage = state.stage;
    if (stage.kind !== 'ChooseTrail') throw new Error('ChooseTrail');
    const playerAttacks = getAttackedSquares(state, state.color);
    const opponentAttacks = getAttackedSquares(state, opposite(state.color));
    const isPlayerPiece = stage.piece.color === state.color;
    const weightedTrails: Weighted<{ trail: Trail }>[] = [];

    for (const trail of stage.trails) {
        let weight = 0;

        weight += (isPlayerPiece ? 1 : -1) * trail.length;
        const dest = trail[trail.length - 1];
        if (isPlayerPiece && opponentAttacks.has(dest)) {
            weight -= roleValue(stage.piece.role) * 10;
        } else if (!isPlayerPiece && playerAttacks.has(dest)) {
            weight += roleValue(stage.piece.role) * 10;
        }

        const tempPieceId = -1;
        const moves = withTempState(state, state => {
            state.cg.state.pieces.set(dest, stage.piece);
            state.pieceIds.set(dest, tempPieceId);
            setPieceTrail(state, tempPieceId, trail);
            return getMoves(state, dest, true, true);
        });

        if (moves.length) {
            let futureMoveWeight = moves
                .map(move => computeMoveWeight(state.color, isPlayerPiece ? opponentAttacks : playerAttacks, false, trail, move))
                .reduce((weight1, weight2) => Math.max(weight1, weight2)) / 2;
            weight += isPlayerPiece ? futureMoveWeight : -futureMoveWeight;
        }
        weightedTrails.push({trail, weight});
    }
    return sortWeights(weightedTrails)[0].trail;
}

function makeMove(state: TrailChessState, move: Move) {
    state.cg.move(move.trail[0], move.trail[move.trail.length - 1]);
}

function randomWeighted<T>(arr: Weighted<T>[], top: number): T {
    let picks = sortWeights(arr).slice(0, top);
    const notBadPicks = picks.filter(a => a.weight >= 0);
    let weightFunc = w => Math.abs(w);
    if (notBadPicks.length > 0) {
        picks = notBadPicks;
        // Square skews probability toward higher weights
        weightFunc = w => w * w;
    }
    const weightsSquared = picks
        .reduce((s, a) => s + weightFunc(a.weight), 0);
    const rand = Math.random() * weightsSquared;
    let counter = 0;
    console.log(JSON.stringify(picks));
    for (const a of picks) {
        counter += weightFunc(a.weight);
        if (rand <= counter) return a;
    }
    throw new Error("randomWeighted");
}

function withTempState<T>(state: TrailChessState, func: (TrailChessState) => T): T {
    const tempState = {
        ...state,
        pieceIds: new Map(state.pieceIds),
        trailMap: new Map(state.trailMap),
        trails: new Map(state.trails)
    };
    const piecesBackup = state.cg.state.pieces;
    state.cg.state.pieces = new Map(state.cg.state.pieces);
    const result = func(tempState);
    state.cg.state.pieces = piecesBackup;
    return result;
}

function getWeightedPlacement(state: TrailChessState, random: boolean): Weighted<{ placeAt: Key, piece: Piece }>[] {
    const pieceBank = state.pieceBank.get(state.color) as Map<Role, number>;

    const freeSquares: Key[] = [];
    for (const file of 'abcdefgh') {
        for (const rank of [1, 2, 3, 4, 5, 6, 7, 8]) {
            const key = `${file}${rank}` as Key;
            if (!state.trailMap.has(key)) {
                freeSquares.push(key);
            }
        }
    }

    shuffleArray(freeSquares);

    const tempPieceId = -1;
    const availableRoles = [...pieceBank].filter(([_, count]) => count > 0).map(([role]) => role);
    if (availableRoles.length === 0) return [];
    const weightedPlacements: { placeAt: Key, piece: Piece, weight: number }[] = [];

    let attempts = 50;

    const opponentAttacks = getAttackedSquares(state, opposite(state.color));

    for (const key of freeSquares) {
        if (attempts-- == 0) break;
        const role: Role = pickRandom(availableRoles);
        const piece = {role, color: state.color};

        const moves: Weighted<{move: Move}>[] = withTempState(state, state => {
            state.cg.state.pieces.set(key, piece);
            state.pieceIds.set(key, tempPieceId);
            const oldTrail = [key];
            setPieceTrail(state, tempPieceId, oldTrail);
            return getMoves(state, key, false, false)
                .map(move => ({
                    move,
                    weight: computeMoveWeight(state.color, opponentAttacks, true, oldTrail, move)
                }));
        });

        if (moves.length) {
            let weight = 5 + moves.map(move => move.weight)
                .reduce((weight1, weight2) => Math.max(weight1, weight2), 0);
            const inBankCount = [...pieceBank.values()].reduce((a, b) => a + b, 0);
            const onBoardCount = [...state.cg.state.pieces.values()]
                .filter(p => p.color == state.color).length;
            const piecesMultiplier = 1 + inBankCount / (onBoardCount + inBankCount);
            weight *= freeSquares.length / 64 * piecesMultiplier;
            weightedPlacements.push({placeAt: key, piece, weight});
            if (random) {
                return weightedPlacements;
            }
        }
    }
    return weightedPlacements;
}

export function aiPlay(state: TrailChessState, random: boolean) {
    const stage = state.stage;
    validateState(state);
    if (stage.kind == 'MoveOrPlace') {
        type WeightedMoveOrPlacement = { weight: number } & ({ placeAt: Key, piece: Piece } | { move: Move });
        let allOptions: WeightedMoveOrPlacement[] = [];
        allOptions = allOptions.concat(getWeightedPlacement(state, random));
        allOptions = allOptions.concat(getWeightedMoves(state, random));
        allOptions.sort((a, b) => b.weight - a.weight);
        if (allOptions.length == 0) {
            return;
        }
        const choice = random ? pickRandom(allOptions) : randomWeighted(allOptions, 2);
        validateState(state);
        if ('placeAt' in choice) {
            state.cg.state.pieces.set('a0', choice.piece);
            dropNewPiece(state.cg.state, 'a0', choice.placeAt, true);
        } else {
            makeMove(state, choice.move);
        }
    } else if (stage.kind == 'MovePlacedPiece') {
        const moves = getWeightedMoves(state, random);
        const choice = random ? pickRandom(moves) : randomWeighted(moves, 2);
        validateState(state);
        makeMove(state, choice.move);
    } else if (stage.kind == 'ChooseTrail') {
        const trail = random ? pickRandom(stage.trails) : bestTrailChoice(state);
        // The trail always minimal length 2.
        // The first square may be shared by knight trails.
        state.cg.selectSquare(trail[1]);
    }
    state.cg.state.dom.redraw();
}
