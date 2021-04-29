import {Chessground} from 'chessground';
import {DrawShape} from 'chessground/draw';
import {Api} from 'chessground/api';
import {key2pos, opposite, pos2key} from 'chessground/util';
import {Key, Color, Role, Piece} from 'chessground/types';
import {premove} from 'chessground/premove';
import * as cg from "chessground/types";
import {createElement as createSVG, setAttributes} from 'chessground/svg';

/*
TODO:
1. Move filtering
    a. Disable capture on the move of a new piece. DONE.
    b. Restrict moves with trails. DONE.
2. Logic of cutting trails. DONE.
3. Override moves for pawns. DONE.
4. When moving a placed piece do not let the dests disappear when clicked on a non-reachable square. DONE.
5. Knight loses its past trail. DONE
6. Pawn promotion. DONE
7. Remove just placed piece when clicked on it. DONE.
8. Bug when cannot choose a piece when it is displayed on top of a piece on the board. DONE.
9. Display counter of available pieces. DONE.
10. Do not let a piece that was just placed to cut the trails. DONE.
11. After knight captures a piece an error happens. DONE.
12. When cutting another trail, state.lastMove gets set to one of its paths. DONE.
13. Update trails svg when boundsUpdated. TODO:
14. Save dests for taking back piece. DONE.
15: Pawn promotion should only happen when reaching the furthest edge. DONE.
 */

export function runTrailChess(el): TrailChessState {
    const cg = Chessground(el, {
        fen: '8/8/8/8/8/8/8/8',
        orientation: 'white',
        movable: {
            showDests: true,
            color: 'white',
            free: false
        },
        premovable: {
            enabled: false
        },
        draggable: {
            showGhost: true
        },
        animation: {
            enabled: true
        }
    });
    let state: TrailChessState = {
        cg: cg,
        stage: {
            kind: 'MoveOrPlace'
        },
        pieceIds: new Map<Key, PieceId>(),
        trailMap: new Map<Key, PieceId>(),
        trails: new Map<PieceId, Trail>(),
        pieceBank: new Map([
            ['black', makeStartingPieces()],
            ['white', makeStartingPieces()],
        ]),
        pieceIdCounter: 0,
        color: 'white'
    };

    cg.set({
        events: {
            move: (orig, dest) => onMove(state, orig, dest),
            select: key => onSelect(state, key),
            dropNewPiece: (piece, key) => onDropNewPiece(state, piece, key),
            change: () => onChange(state)
        }
    });
    return state;
}

// https://github.com/ornicar/lila/blob/master/ui/round/src/crazy/crazyView.ts
function onDropNewPiece(state: TrailChessState, piece: Piece, key: Key) {
    const stage = state.stage;
    if (stage.kind != 'MoveOrPlace') {
        throw Error(`Unexpected stage ${stage.kind}`);
    }
    // After calling the drop listener, chessground sets the opposite color.
    // We need preserve the turn color after dropping the piece.
    state.cg.state.turnColor = piece.color;

    if (state.trailMap.has(key)) {
        state.cg.state.pieces.delete(key);
        state.cg.state.dom.redraw();
        return;
    }

    const playerPieces = state.pieceBank.get(piece.color)!;
    const newPieceCount = playerPieces.get(piece.role)! - 1;
    if (newPieceCount < 0) {
        return;
    }
    playerPieces.set(piece.role, newPieceCount);

    const pieceId = state.pieceIdCounter++;
    placePieceCG(state, piece, key);
    state.pieceIds.set(key, pieceId);
    setPieceTrail(state, pieceId, [key]);
    const movesMapBackup = state.movesMap || new Map();
    const moves = getMoves(state, key, false, false);
    state.movesMap = new Map([[key, moves]]);
    state.cg.set({movable: {dests: movesToDests(state.movesMap)}});

    setStage(state, {
        kind: 'MovePlacedPiece',
        piece: piece,
        placedAt: key,
        movesMapBackup
    });
    state.cg.selectSquare(key);
}

function onChange(state: TrailChessState) {
    const stage = state.stage;
    if (stage.kind == 'MovePlacedPiece' && !state.cg.state.pieces.has(stage.placedAt)) {
        // The newly placed piece was removed by dragging outside of the board
        deleteNewlyPlacedPiece(state, stage.placedAt);
    }
}

function onMove(state: TrailChessState, orig: Key, dest: Key): void {
    const stage = state.stage;
    if (stage.kind == 'MoveOrPlace' || stage.kind == 'MovePlacedPiece') {
        const piece = state.cg.state.pieces.get(dest)!;

        const pieceId = state.pieceIds.get(orig)!;
        const allowCut = stage.kind != 'MovePlacedPiece';
        const capturedPieceId = state.pieceIds.get(dest);
        if (capturedPieceId != undefined) {
            // At this point cg.state.pieces already has the moved piece that captured, so don't delete on the cg board.
            deletePiece(state, capturedPieceId, false);
        }

        let trails = getTrailsForMove(piece.role, orig, dest)
            .filter(t => analyzeFutureTrail(state, piece, t, allowCut, true));
        if (trails.length > 1) {
            // Disable moves until the trail is chosen.
            state.cg.set({movable: {dests: new Map()}});
            const oldTrail = state.trails.get(pieceId);
            deletePiece(state, pieceId, false);
            state.cg.state.pieces.delete(dest);
            setStage(state, {kind: 'ChooseTrail', trails, piece, pieceId, oldTrail});
        } else if (trails.length == 1) {
            growTrail(state, pieceId, trails[0], capturedPieceId != undefined);
        } else {
            throw Error('A valid move has zero trails ' + stage.kind);
        }
    } else {
        throw Error('Moved during a wrong stage ' + stage.kind);
    }
    drawState(state);
}

function setStage(state: TrailChessState, stage: TrailChessStage) {
    state.stage = stage;
    const container = state.cg.state.dom.elements.container;
    console.log(JSON.stringify(stage));
    container.dispatchEvent(new Event('trailchessStage', {bubbles: true}));
}

export function deletePiece(state: TrailChessState, pieceId: PieceId, deleteCg) {
    const trail = state.trails.get(pieceId) as Trail;
    const key = last(trail);
    for (const key of trail) {
        state.trailMap.delete(key);
    }
    state.pieceIds.delete(key);
    state.trails.delete(pieceId);
    if (deleteCg) {
        state.cg.state.pieces.delete(key);
    }
}

// Is called from onmove and on choosing trail. The piece at orig may not exist on the board.
function growTrail(state: TrailChessState, pieceId: PieceId, trail: Key[], captured: boolean) {
    const dest = last(trail);
    const piece = state.cg.state.pieces.get(dest) as Piece;


    const checkPromotion = () => {
        if (piece.role == 'pawn'&& isPawnPromoted(state.trails.get(pieceId)![0], dest)) {
            state.cg.state.pieces.set(dest, {role: 'queen', color: piece.color, promoted: true});
        }
    };
    const endMove = () => {
        checkPromotion();
        playOtherSide(state);
        setStage(state, {kind: 'MoveOrPlace'});
    };

    state.pieceIds.delete(trail[0]);
    const cutSquare = trail.slice(1).find(key => state.trailMap.has(key));
    console.log('growTrail cutSquare', cutSquare);

    if (!cutSquare) {
        setPieceTrail(state, pieceId, trail);
        state.pieceIds.set(dest, pieceId);
        endMove();
        return;
    }

    const cutPieceId = state.trailMap.get(cutSquare) as PieceId;
    const cutTrail = state.trails.get(cutPieceId) as Trail;
    const cutPiece = state.cg.state.pieces.get(
        cutPieceId == pieceId ? dest : last(cutTrail)
    ) as Piece;

    let candidateTrails: Trail[];
    deletePiece(state, cutPieceId, true);

    if (cutPieceId == pieceId) {
        // A piece can follow in its own trail or intersect it many times.
        // So, we can have more than one trail.
        candidateTrails = splitSelfTrail(cutTrail, trail)
            .filter(t => isValidSubTrail(t));
        if (captured) {
            // If a piece cut its own path and captured,
            // it must stay on the square where the capture happened.
            candidateTrails = [last(candidateTrails)];
        }
    } else {
        // If the piece does not intersect its own path, it ends up at its destination
        state.pieceIds.set(dest, pieceId);
        const before = cutTrail.slice(0, cutTrail.indexOf(cutSquare));
        const after = cutTrail.slice(cutTrail.indexOf(cutSquare) + 1);
        candidateTrails = [before, after].filter(t => isValidSubTrail(t));
    }

    if (cutPieceId != pieceId) {
        setPieceTrail(state, pieceId, trail);
    }
    if (candidateTrails.length == 0) {
        endMove();
    } else if (candidateTrails.length == 1) {
        const trail = candidateTrails[0];
        const dest = last(trail);
        placePieceCG(state, cutPiece, dest);
        state.pieceIds.set(dest, cutPieceId);
        setPieceTrail(state, cutPieceId, trail);
        endMove();
    } else {
        state.cg.set({movable: {dests: new Map()}});
        if (pieceId == cutPieceId) {
            state.cg.state.pieces.delete(dest);
        }
        checkPromotion();
        setStage(state, {
            kind: 'ChooseTrail',
            trails: candidateTrails,
            piece: cutPiece,
            pieceId: cutPieceId
        })
    }
    validateState(state);
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

export function validateState(state: TrailChessState) {
    let assert = (msg, isGood) => {
        if (!isGood) {
            throw new Error(msg)
        }
    };
    let setEq = (s1, s2) => s1.size === s2.size && [...s1].every(x => s2.has(x));
    const pieceIdSet = new Set(state.pieceIds.values());
    // chess fen is longer - it includes turn
    assert('Each key has a unique pieceId', pieceIdSet.size == state.pieceIds.size);
    assert('PieceIds and trails correspond', setEq(pieceIdSet, new Set(state.trails.keys())));
    assert('PieceIds and chessground correspond', setEq(new Set(state.pieceIds.keys()), new Set(state.cg.state.pieces.keys())));
    [...state.pieceIds.entries()].every(([key, pieceId]) => {
        const trail = state.trails.get(pieceId) as Trail;
        assert(`PieceId ${pieceId} is at the key at the end its trail`, last(trail) == key);
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

export function setPieceTrail(state, pieceId, trail: Trail) {
    for (const key of trail) {
        state.trailMap.set(key, pieceId)
    }

    let pieceTrail = state.trails.get(pieceId);
    if (!pieceTrail) {
        state.trails.set(pieceId, trail);
    } else {
        const newSquares = trail.slice(1);
        state.trails.set(pieceId, pieceTrail.concat(newSquares));
    }
}

function getTrailsForMove(role: Role, orig, dest): Trail[] {
    function lineToTrail([x1, y1]: [number, number], [x2, y2]: [number, number]): Key[] {
        // Makes a sequence of adjacent keys
        // The knight path is split in two straight segments, so
        // a trail can only have straight or diagonal segments.
        const path: Key[] = [pos2key([x1, y1])];
        const xDelta = Math.sign(x2 - x1); // +1, -1, 0
        const yDelta = Math.sign(y2 - y1); // +1, -1, 0
        // This loop will hang if the segments aren't straight or diagonal.
        let x = x1, y = y1;
        do {
            x += xDelta;
            y += yDelta;
            path.push(pos2key([x, y]));
        } while (x != x2 || y != y2)
        return path;
    }

    // Knight can have two trails for the same move.
    const [x1, y1] = key2pos(orig),
        [x2, y2] = key2pos(dest);
    if (role == 'knight') {
        return [
            lineToTrail([x1, y1], [x1, y2]).concat(lineToTrail([x1, y2], [x2, y2]).slice(1)),
            lineToTrail([x1, y1], [x2, y1]).concat(lineToTrail([x2, y1], [x2, y2]).slice(1))
        ];
    } else {
        return [lineToTrail([x1, y1], [x2, y2])];
    }
}

const makeStartingPieces = () => new Map<Role, number>([
    ['queen', 1],
    ['rook', 2],
    ['bishop', 2],
    ['knight', 2],
    ['pawn', 8]
]);

export type TrailChessState = {
    cg: Api
    pieceBank: Map<Color, Map<Role, number>>
    // This tracks trails of the pieces on board. It is in sync with the state.pieces
    pieceIds: Map<Key, PieceId>
    // trails and trailMap describe the same structure. This is an optimization for access by pieceId and key. They must be in sync.
    trails: Map<PieceId, Trail>
    trailMap: Map<Key, PieceId>
    pieceIdCounter: number
    stage: TrailChessStage
    color: Color
    // Holds the last move and destinations so that they can be restored after taking back a dropped piece
    movesMap?: Map<Key, Move[]>
    lastMove?: Key[]
}

export type PieceId = Number

interface TrailChessStageMoveOrPlace {
    kind: 'MoveOrPlace'
}

interface TrailChessStageMovePlacedPiece {
    kind: 'MovePlacedPiece'
    piece: Piece
    placedAt: Key
    movesMapBackup: Map<Key, Move[]>
}

interface TrailChessStageChooseTrail {
    kind: 'ChooseTrail'
    trails: Trail[]
    oldTrail?: Trail
    piece: Piece
    pieceId: PieceId
}

type TrailChessStage = TrailChessStageMoveOrPlace
    | TrailChessStageMovePlacedPiece
    | TrailChessStageChooseTrail


function placePieceCG(state: TrailChessState, piece: Piece, key: Key) {
    // Update the state directly. The function dropNewPiece changes color and movables.
    state.cg.state.pieces.set(key, piece);
}

function onSelect(state: TrailChessState, key: Key) {
    const stage = state.stage;

    if (state.cg.state.lastMove?.length == 2 && state.cg.state.lastMove[1] == key) {
        if (stage.kind != 'ChooseTrail') {
            // If onSelect was invoked as a result of the move, let onMove handle the change.
            // We can only indirectly deduce it from the stage. Also, it can be a click selecting a piece.
            return;
        }
    }
    if (stage.kind == 'MovePlacedPiece') {
        if (state.cg.state.selected !== stage.placedAt) {
            state.cg.selectSquare(stage.placedAt);
        } else {
            state.cg.state.draggable.deleteOnDropOff = true;
        }
        return;
    } else if (stage.kind == 'ChooseTrail') {
        const trailsWithKey = stage.trails
            .map(t => t.includes(key));
        const trailIndex = trailsWithKey.indexOf(true);
        if (trailIndex == -1 || trailsWithKey.indexOf(true, trailIndex + 1) != -1) {
            // Not found or not unique
            return;
        }
        const trail = stage.trails[trailIndex];
        const startTrail = stage.oldTrail ? stage.oldTrail : [trail[0]];

        console.log('Start trail', startTrail, 'trail', trail);
        placePieceCG(state, stage.piece, last(trail));
        state.pieceIds.set(trail[0], stage.pieceId);
        setPieceTrail(state, stage.pieceId, startTrail);
        growTrail(state, stage.pieceId, trail, false);
    }
    drawState(state);
}

function logState(state: TrailChessState) {
    console.log(state.cg.state.turnColor);
    console.log(state.stage.kind);
    console.log('pieceIds', JSON.stringify([...state.pieceIds]));
    console.log('trailMap', JSON.stringify([...state.trailMap]));
    console.log('trails', JSON.stringify([...state.trails]));
}

function drawState(state: TrailChessState) {
    const stage = state.stage;
    logState(state);
    const container = state.cg.state.dom.elements.container;
    let trailsSvg = container.querySelector('.cg-trails');
    if (!trailsSvg) {
        trailsSvg = setAttributes(createSVG('svg'), {'class': 'cg-trails'});
        trailsSvg.appendChild(createSVG('g'));
        container.appendChild(trailsSvg);
    }

    const trailsToDraw: { trail: Trail, classes: string[] }[] = [];
    for (const trail of state.trails.values()) {
        const position = last(trail);
        const {color} = state.cg.state.pieces.get(position)!;
        trailsToDraw.push({classes: [`trail-${color}`], trail});
    }
    if (stage.kind == 'ChooseTrail') {
        stage.trails.forEach(trail =>
            trailsToDraw.push({classes: [`trail-choose`, `trail-${stage.piece.color}`], trail})
        );
        if (stage.oldTrail) {
            trailsToDraw.push({classes: [`trail-${stage.piece.color}`], trail: stage.oldTrail});
        }
    }
    const shapes: DrawShape[] = [];
    if (stage.kind == 'ChooseTrail') {
        stage.trails.forEach(trail =>
            shapes.push({
                orig: last(trail),
                piece: stage.piece
            }));
    }
    syncTrailsSvg(state.cg, trailsSvg.querySelector('g')!, trailsToDraw);
    state.cg.setAutoShapes(shapes);
    validateState(state);
}

function drawTrail(cg: Api, classes: string[], trail: Trail): SVGElement {
    function pos2px(pos: cg.Pos, bounds: ClientRect): cg.NumberPair {
        return [((pos[0] + 0.5) * bounds.width) / 8, ((7.5 - pos[1]) * bounds.height) / 8];
    }

    const bounds = cg.state.dom.bounds();
    const lineWidth = (10 / 512) * bounds.width;

    const points = trail.map(s => {
        const [x, y] = pos2px(key2pos(s), bounds);
        return x + ',' + y;
    }).join(' ');
    return setAttributes(createSVG('polyline'), {
        class: "trail " + classes.join(' '),
        'stroke-width': lineWidth,
        points: points
    });
}

function syncTrailsSvg(cg: Api, root: SVGElement, trails: { trail: Trail, classes: string[] }[]) {
    const hashTrail = (trail, classes) => classes + JSON.stringify(trail);
    const trailsInDom = new Map(), // by hash
        toRemove: SVGElement[] = [];
    for (const {trail, classes} of trails) trailsInDom.set(hashTrail(trail, classes), false);
    let el: SVGElement | undefined = root.firstChild as SVGElement,
        trailKeys: string;
    while (el) {
        trailKeys = el.getAttribute('cgTrail') as string;
        // found a shape element that's here to stay
        if (trailsInDom.has(trailKeys)) trailsInDom.set(trailKeys, true);
        // or remove it
        else toRemove.push(el);
        el = el.nextSibling as SVGElement | undefined;
    }
    // remove old shapes
    for (const el of toRemove) root.removeChild(el);
    // insert shapes that are not yet in dom
    for (const {trail, classes} of trails) {
        if (!trailsInDom.get(hashTrail(trail, classes))) root.appendChild(drawTrail(cg, classes, trail));
    }
}

function last<T>(arr: T[]): T {
    return arr[arr.length - 1];
}

function deleteNewlyPlacedPiece(state: TrailChessState, key) {
    const stage = state.stage;
    if (stage.kind !== 'MovePlacedPiece') {
        throw 'Expected MovePlacePiece stage';
    }
    const piece = stage.piece;
    deletePiece(state, state.pieceIds.get(key) as number, true);
    state.movesMap = stage.movesMapBackup;
    state.cg.set({
        movable: {
            dests: movesToDests(state.movesMap)
        },
        lastMove: state.lastMove,
        selected: undefined
    })
    const playerPieces = state.pieceBank.get(piece.color) as Map<Role, Number>;
    const newPieceCount = playerPieces.get(piece.role) as number + 1;
    playerPieces.set(piece.role, newPieceCount);
    const pieceEl = document.querySelector(`.pocket .${piece.role}.${piece.color}`) as HTMLElement;
    pieceEl.dataset.count = String(newPieceCount);
    setStage(state, {kind: 'MoveOrPlace'});
}

export interface Move {
    piece: Piece
    pieceId: PieceId
    captures?: {pieceId: PieceId, piece: Piece}
    cuts?: { pieceId: PieceId, piece: Piece, isErased: boolean }
    trail: Trail
}

function analyzeFutureTrail(state: TrailChessState, piece: Piece, trail: Trail, allowCut, isMoved): Move | null {
    // Trail is valid if:
    // If a piece is captured, its trail is ignored in the rules below.
    // A new trail cuts an existing trail when they share one common square.
    // Trail cannot cut more than one trail of a piece, including its own.
    // Trail cannot follow overlap with the trail of another piece.
    // New trail of a piece can overlap with its own trail.
    // A piece can cut its own trail only once too.
    if (trail.length <= 1) {
        // any trail longer than the current square is fine. For the knight too
        return null;
    }

    const dest = last(trail);
    const pieceId = state.pieceIds.get(trail[0])!;
    let cutPieceId: PieceId | undefined = undefined;
    let cutSquare: Key | undefined = undefined;
    const capturedPieceId = state.pieceIds.get(dest);
    const capturedPiece = state.cg.state.pieces.get(dest);

    for (const s of trail.slice(1)) {
        const pieceIdOnTrail = state.trailMap.get(s);
        if (pieceIdOnTrail == undefined) {
            continue;
        } else if (!allowCut) {
            return null;
        }
        const pieceOnTrail = state.cg.state.pieces.get(s);
        if (pieceOnTrail) {
            if (s != dest) {
                // The trail cannot have any pieces till the end.
                return null;
            } else if (!isMoved && pieceOnTrail.color == piece.color) {
                // Cannot capture piece of own color at the end of the trail.
                // If isValidFutureTrail is called before move, dest has a piece of opposite color
                // that would be captured. If called on move, it would be the piece that moved.
                return null;
            }
        }

        if (pieceIdOnTrail == capturedPieceId) {
        } else if (cutPieceId == undefined) {
            cutPieceId = pieceIdOnTrail;
            cutSquare = s;
        } else if (pieceIdOnTrail != cutPieceId) {
            return null;  // Cutting trails of two pieces
        } else if (pieceIdOnTrail != pieceId) {
            return null;  // Going through many squares of a trail instead of cutting it
        }
    }

    let cuts: {pieceId: PieceId, piece: Piece, isErased: boolean} | undefined = undefined;
    if (cutPieceId != undefined) {
        let isErased = false;
        const cutTrail = state.trails.get(cutPieceId) as Trail;
        const piece = state.cg.state.pieces.get(last(cutTrail)) as Piece;
        if (cutPieceId != pieceId) {
            const before = cutTrail.slice(0, cutTrail.indexOf(cutSquare as Key));
            const after = cutTrail.slice(cutTrail.indexOf(cutSquare as Key) + 1);
            isErased = !isValidSubTrail(before) && !isValidSubTrail(after);
        }
        cuts = {pieceId: cutPieceId, piece, isErased};
    }
    const captures = capturedPieceId !== undefined ? {pieceId: capturedPieceId, piece: capturedPiece!} : undefined;
    return {piece, pieceId, captures, cuts, trail};
}

function isValidSubTrail(trail) {
    // any trail longer than the current square is fine. For the knight too
    return trail.length > 1;
}

function isPawnPromoted(trailStart: Key, dest: Key) {
    const [[x1, y1], [x2, y2]] = [trailStart, dest].map(key2pos);
    const [xDelta, yDelta] = [x2 - x1, y2 - y1];
    const getEdgeIndex = delta => delta == 0 ? null : (delta < 0 ? 0 : 7);
    const [xEdge, yEdge] = [getEdgeIndex(xDelta), getEdgeIndex(yDelta)];
    if (Math.abs(xDelta) == Math.abs(yDelta)) {
        return x2 == xEdge || y2 == yEdge;
    } else {
        return Math.abs(xDelta) > Math.abs(yDelta) ? x2 == xEdge : y2 == yEdge;
    }
}

export function getMoves(state: TrailChessState, key: Key, allowCapture: boolean, allowCut: boolean): Move[] {
    const selfPieceId = state.pieceIds.get(key);
    const piece = state.cg.state.pieces.get(key);
    if (selfPieceId === undefined || piece === undefined) {
        throw new Error('No piece found');
    }
    let dests: Key[];
    if (piece.role == 'pawn') {
        const trail = state.trails.get(selfPieceId) as Trail;
        if (trail.length == 1) {
            // The first move only depends on the quadrant. No capture.
            const [x, y] = key2pos(key);
            const xSign = x < 4 ? 1 : -1;  // Move toward further edge.
            const ySign = y < 4 ? 1 : -1;
            dests = [[x + 1 * xSign, y], [x + 2 * xSign, y], [x, y + 1 * ySign],
                [x, y + 2 * ySign]].map(pos2key);
        } else {
            // Continue in the direction. If the bounding rectangle of the trail is a square,
            // the pawn can still choose the direction. For example, pawn only moved diagonally with captures.
            const [[x1, y1], [x2, y2]] = [trail[0], last(trail)].map(key2pos);
            const [xDelta, yDelta] = [x2 - x1, y2 - y1];
            const isPosValid = ([x, y]) => x >= 0 && x < 8 && y >= 0 && y < 8;
            let pawnMoves: [[number, number], boolean][];
            const xMoves: [[number, number], boolean][] =
                [[[x2 + Math.sign(xDelta), y2 - 1], true], [[x2 + Math.sign(xDelta), y2], false], [[x2 + Math.sign(xDelta), y2 + 1], true]];
            const yMoves: [[number, number], boolean][] =
                [[[x2 - 1, y2 + Math.sign(yDelta)], true], [[x2, y2 + Math.sign(yDelta)], false], [[x2 + 1, y2 + Math.sign(yDelta)], true]];
            if (Math.abs(xDelta) == Math.abs(yDelta)) {
                pawnMoves = [...xMoves, ...yMoves];
            } else {
                pawnMoves = Math.abs(xDelta) > Math.abs(yDelta) ? xMoves : yMoves;
            }
            dests = pawnMoves.filter(([pos, _]) => isPosValid(pos))
                // Filter out the diagonal moves if there is no piece to capture
                .filter(([pos, capture]) => state.cg.state.pieces.has(pos2key(pos)) ? capture : !capture)
                .map(([pos, _]) => pos2key(pos));
            dests = [...new Set([...dests])]; // x and y may overlap.
        }
    } else {
        dests = premove(state.cg.state.pieces, key, false);
    }
    const moves: Move[] = [];
    for (const dest of dests) {
        if (!allowCapture && state.cg.state.pieces.has(dest)) continue;
        for (const trail of getTrailsForMove(piece.role, key, dest)) {
            const move = analyzeFutureTrail(state, piece, trail, allowCut, false);
            if (!move) continue;
            moves.push(move);
        }
    }
    return moves;
}

export type Trail = Key[];

function movesToDests(movesMap: Map<Key, Move[]>): Map<Key, Key[]> {
    const destsMap: Map<Key, Key[]> = new Map();
    for (const [s, moves] of movesMap) {
        destsMap.set(s, moves.map(m => last(m.trail)));
    }
    return destsMap;
}

function playOtherSide(state: TrailChessState) {
    const color = opposite(state.color);
    state.color = color;
    state.movesMap = getAllMoves(state);
    state.lastMove = state.cg.state.lastMove;
    state.cg.set({
        turnColor: color,
        movable: {
            color: color,
            dests: movesToDests(state.movesMap)
        }
    });
}

export function getAllMoves(state: TrailChessState): Map<Key, Move[]> {
    const moves: Map<Key, Move[]> = new Map();
    for (const s of state.cg.state.pieces.keys()) {
        const pieceMoves = getMoves(state, s, true, true);
        if (pieceMoves.length) moves.set(s, pieceMoves);
    }
    return moves;
}
