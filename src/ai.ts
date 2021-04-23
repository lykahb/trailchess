import {Api} from "chessground/api";
import {dropNewPiece} from "chessground/board";
import {Color, Key, Piece, Role} from "chessground/types";
import {opposite} from 'chessground/util';
import {ChesstrailState, deletePiece, getMoves, setPieceTrail, Move, Trail} from "./chesstrail"

function pickRandom<T>(list: T[]): T {
    return list[Math.floor(Math.random() * list.length)];
}

function roleValue(role: Role): number {
    return {
        'pawn': 1,
        'knight': 3,
        'bishop': 3,
        'rook': 5,
        'queen': 9
    } [role];
}

function computeMoveWeight(cg: Api, state: ChesstrailState, piece: Piece, move: Move, opponentAttacks: Set<Key>, isPlaced: boolean): number {
    let weight = 0;
    const orig = move.trail[0];
    const dest = move.trail[move.trail.length - 1];
    if (move.capturedPieceId !== undefined) {
        const capturedPiece = cg.state.pieces.get(move.trail[move.trail.length - 1]) as Piece;
        weight += roleValue(capturedPiece.role) * 11;
    }
    weight += move.trail.length;

    const [origAttacked, destAttacked] = [opponentAttacks.has(orig), opponentAttacks.has(dest)];
    if ((isPlaced || !origAttacked) && destAttacked) {
        weight -= roleValue(piece.role) * 10;
    } else if (!isPlaced && origAttacked && !destAttacked) {
        weight += roleValue(piece.role) * 10;
    }

    if (move.cuts) {
        const weightSign = move.cuts.piece.color === state.color ? -1 : 1;
        if (move.cuts.isErased) {
            weight += weightSign * 10 * roleValue(move.cuts.piece.role);
        } else {
            weight += weightSign * 5;
        }
    }
    return weight;
}

function getAttackedSquares(cg: Api, state: ChesstrailState, attackerColor: Color): Set<Key> {
    const attackedSquares: Set<Key> = new Set();
    const mapAfterMove = state.stage.kind == 'MovePlacedPiece' ? state.stage.movesMapBackup : state.movesMap;
    if (!mapAfterMove) return attackedSquares;

    for (const [s, moves] of mapAfterMove) {
        if (cg.state.pieces.get(s)?.color !== attackerColor) continue;
        for (const move of moves) {
            attackedSquares.add(move.trail[move.trail.length - 1]);
        }
    }
    return attackedSquares;
}

function getWeightedMoves(cg: Api, state: ChesstrailState): Weighted<{move: Move}>[] {
    if (!state.movesMap) return [];
    const opponentAttacks = getAttackedSquares(cg, state, opposite(state.color));
    const weightedMoves: { move: Move, weight: number }[] = [];
    for (const [s, moves] of state.movesMap) {
        const piece = cg.state.pieces.get(s) as Piece;
        if (piece.color !== state.color) continue;
        for (const move of moves) {
            const weight = computeMoveWeight(cg, state, piece, move, opponentAttacks, false);
            weightedMoves.push({move, weight});
        }
    }
    return weightedMoves;
}

type Weighted<T> = { weight: number } & T;
function sortWeights<T>(arr: Weighted<T>[]): Weighted<T>[] {
    return arr.sort((a, b) => b.weight - a.weight);
}

function bestTrailChoice(cg: Api, state: ChesstrailState): Trail {
    const stage = state.stage;
    if (stage.kind !== 'ChooseTrail') throw new Error('ChooseTrail');
    const playerAttacks = getAttackedSquares(cg, state, state.color);
    const opponentAttacks = getAttackedSquares(cg, state, opposite(state.color));
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

        // What can we do after this
        const tempPieceId = -1;
        state.pieceIds.set(dest, tempPieceId);
        cg.state.pieces.set(dest, stage.piece);
        setPieceTrail(state, tempPieceId, trail);
        const moves = getMoves(cg, state, dest, true, true);
        if (moves.length) {
            let futureMoveWeight = moves
                .map(move => computeMoveWeight(cg, state, stage.piece, move, isPlayerPiece ? opponentAttacks : playerAttacks, false))
                .reduce((weight1, weight2) => Math.max(weight1, weight2)) / 2;
            weight += isPlayerPiece ? futureMoveWeight : -futureMoveWeight;
        }
        deletePiece(cg, state, tempPieceId, true);

        weightedTrails.push({trail, weight});
    }
    return sortWeights(weightedTrails)[0].trail;
}

function makeMove(cg: Api, move: Move) {
    cg.move(move.trail[0], move.trail[move.trail.length - 1]);
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
    for (const a of picks) {
        counter += weightFunc(a.weight);
        if (rand <= counter) return a;
    }
    throw new Error("randomWeighted");
}

function getWeightedPlacement(cg: Api, state: ChesstrailState): { placeAt: Key, piece: Piece, weight: number }[] {
    const pieceBank = state.pieceBank.get(state.color) as Map<Role, Number>;

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
    }

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
    const opponentAttacks = getAttackedSquares(cg, state, opposite(state.color));
    for (const key of freeSquares) {
        if (attempts-- == 0) break;
        const role = pickRandom(availableRoles);
        const piece = {role, color: state.color};
        state.pieceIds.set(key, tempPieceId);
        cg.state.pieces.set(key, piece);
        setPieceTrail(state, tempPieceId, [key]);
        const moves = getMoves(cg, state, key, false, false);
        deletePiece(cg, state, tempPieceId, true);
        if (moves.length) {
            let weight = moves.map(move => computeMoveWeight(cg, state, piece, move, opponentAttacks, true))
                .reduce((weight1, weight2) => Math.max(weight1, weight2));
            weight *= freeSquares.length / 64;
            weightedPlacements.push({placeAt: key, piece, weight});
        }
    }
    return weightedPlacements;
}

export function aiPlay(cg: Api, state: ChesstrailState) {
    const stage = state.stage;

    if (stage.kind == 'MoveOrPlace') {
        type WeightedMoveOrPlacement = { weight: number } & ({ placeAt: Key, piece: Piece } | { move: Move });
        let allOptions: WeightedMoveOrPlacement[] = [];
        allOptions = allOptions.concat(getWeightedPlacement(cg, state));
        allOptions = allOptions.concat(getWeightedMoves(cg, state));
        allOptions.sort((a, b) => b.weight - a.weight);
        if (allOptions.length == 0) {
            return;
        }
        // const best: WeightedMoveOrPlacement = allOptions[0];
        const choice = randomWeighted(allOptions, 2);
        if ('placeAt' in choice) {
            cg.state.pieces.set('a0', choice.piece);
            dropNewPiece(cg.state, 'a0', choice.placeAt, true);
        } else {
            makeMove(cg, choice.move);
        }
    } else if (stage.kind == 'MovePlacedPiece') {
        const moves = getWeightedMoves(cg, state);
        const choice = randomWeighted(moves, 2);
        makeMove(cg, choice.move);
    } else if (stage.kind == 'ChooseTrail') {
        const trail = bestTrailChoice(cg, state);
        // The trail always minimal length 2.
        // The first square may be shared by knight trails.
        cg.selectSquare(trail[1]);
    }
    cg.state.dom.redraw();
}
