import {Api} from "chessground/api";
import {dropNewPiece} from "chessground/board";
import {Key, Role} from "chessground/types";
import {ChesstrailState, deletePiece, getMoves, setPieceTrail,} from "./chesstrail"

function pickRandom<T>(list: T[]): T {
    return list[Math.floor(Math.random() * list.length)];
}

function randomMove(cg, state) {
    const moves = cg.state.movable.dests;
    if (!moves) return false;
    // TODO: give further moves greater weight
    const from = pickRandom(
        [...moves.keys()].filter(s => cg.state.pieces.get(s)?.color === state.color));
    if (!from) return false;
    const to = pickRandom(moves.get(from) as Key[]);
    cg.move(from, to);
    return true;
}

function randomPlacement(cg, state, freeSquares: Key[]) {
    const pieceBank = state.pieceBank.get(state.color) as Map<Role, Number>;
    let attempts = 100;
    const tempPieceId = -1;
    const availableRoles = [...pieceBank].filter(([_, count]) => count > 0).map(([role]) => role);
    if (availableRoles.length === 0) return false;
    while (attempts--) {
        const role = pickRandom(availableRoles);
        const piece = {role, color: state.color};
        const key = pickRandom(freeSquares);
        state.pieceIds.set(key, tempPieceId);
        cg.state.pieces.set(key, piece);
        setPieceTrail(state, tempPieceId, [key]);
        const moves = getMoves(cg, state, key, false, false);
        deletePiece(cg, state, tempPieceId, true);
        if (!moves.length) {
            continue;
        }
        cg.state.pieces.set('a0', piece);
        dropNewPiece(cg.state, 'a0', key, true);
        return true;
    }
    return false;
}

export function aiPlay(cg: Api, state: ChesstrailState) {
    const stage = state.stage;
    const freeSquares: Key[] = [];
    for (const file of 'abcdefgh') {
        for (const rank of [1, 2, 3, 4, 5, 6, 7, 8]) {
            const key = `${file}${rank}` as Key;
            if (!state.trailMap.has(key)) {
                freeSquares.push(key);
            }
        }
    }
    if (stage.kind == 'MoveOrPlace') {
        const tryPlacementFirst = Math.random() < (freeSquares.length / 64);
        if (tryPlacementFirst) {
            randomPlacement(cg, state, freeSquares) || randomMove(cg, state);
        } else {
            randomMove(cg, state) || randomPlacement(cg, state, freeSquares);
        }
    } else if (stage.kind == 'MovePlacedPiece') {
        randomMove(cg, state);
    } else if (stage.kind == 'ChooseTrail') {
        const trail = pickRandom(stage.trails);
        // The trail always minimal length 2.
        // The first square may be shared by knight trails.
        cg.selectSquare(trail[1]);
    }
    cg.state.dom.redraw();
}
