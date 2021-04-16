import {Chessground} from 'chessground';
import {DrawShape} from 'chessground/draw';
import {Api} from 'chessground/api';
import {anim} from 'chessground/anim';
import {key2pos, pos2key} from 'chessground/util';
import {Key, Color, Role, Piece, Dests} from 'chessground/types';
import {premove} from 'chessground/premove';
import * as cg from "chessground/types";
import {dragNewPiece} from "chessground/drag";
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
12. When intersecting another trail, state.lastMove gets set to one of its paths.
13. Update trails svg when boundsUpdated. TODO:
 */

export const defaults = {
    name: 'Chesstrail',
    run(el) {
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
            duplicateOnCut: true,
            color: 'white'
        };
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
            }
        });

        cg.set({
            events: {
                move: (orig, dest) => onMove(cg, chesstrailState, orig, dest),
                select: key => onSelect(cg, chesstrailState, key),
                dropNewPiece: (piece, key) => onDropNewPiece(cg, chesstrailState, piece, key)
            }
        });
        makePlacementListener(cg, chesstrailState);
        return cg;
    }
};

// https://github.com/ornicar/lila/blob/master/ui/round/src/crazy/crazyView.ts
function onDropNewPiece(cg, state, piece: Piece, key: Key) {
    const stage = state.stage;
    if (stage.kind != 'MoveOrPlace') {
        alert(`Unexpected stage ${stage.kind}`);
    }
    // After calling the drop listener, chessground sets the opposite color.
    // We need preserve the turn color after dropping the piece.
    cg.state.turnColor = piece.color;

    if (state.trailMap.has(key)) {
        cg.state.pieces.delete(key);
        cg.state.dom.redraw();
        return;
    }

    const playerPieces = state.availablePieces.get(piece.color) as Map<Role, Number>;
    const newPieceCount = playerPieces.get(piece.role) as number - 1;
    if (newPieceCount < 0) {
        return;
    }
    playerPieces.set(piece.role, newPieceCount);
    const pieceEl = document.querySelector(`.pocket .${piece.role}.${piece.color}`) as HTMLElement;
    pieceEl.dataset.count = String(newPieceCount);

    const pieceId = state.pieceIdCounter++;
    const oldDests = cg.state.movable.dests;
    placePieceCG(cg, piece, key);
    state.pieceIds.set(key, pieceId);
    setPieceTrail(state, pieceId, [key]);
    const dests = new Map([[key, getMoves(cg, state, key, false, false)]]);
    cg.set({movable: {dests: dests}});
    setStage(state, {
        kind: 'MovePlacedPiece',
        oldDests: oldDests,
        oldLastMove: stage.oldLastMove,
        placedAt: key
    });
    cg.selectSquare(key);
}

function onMove(cg, state, orig, dest): void {
    const stage = state.stage;
    if (stage.kind == 'MoveOrPlace' || stage.kind == 'MovePlacedPiece') {
        const piece = cg.state.pieces.get(dest);
        const pieceId = state.pieceIds.get(orig);
        const allowIntersect = stage.kind != 'MovePlacedPiece';
        const capturedPieceId = state.pieceIds.get(dest);
        if (capturedPieceId != undefined) {
            // At this point cg.state.pieces already has the moved piece that captured, so don't delete on the cg board.
            deletePiece(cg, state, capturedPieceId, false);
        }

        let trails = getTrailsForMove(piece.role, orig, dest)
            .filter(t => isValidFutureTrail(cg, state, piece, t, allowIntersect, true));
        if (trails.length > 1) {
            // Disable moves until the trail is chosen.
            cg.set({movable: {dests: new Map()}});
            const oldTrail = state.trails.get(pieceId);
            deletePiece(cg, state, pieceId, false);
            cg.state.pieces.delete(dest);
            setStage(state, {kind: 'ChooseTrail', trails, piece, pieceId, oldTrail});
        } else if (trails.length == 1) {
            growTrail(cg, state, pieceId, trails[0], capturedPieceId != undefined);
        } else {
            alert('A valid move has zero trails ' + stage.kind)
        }
    } else {
        debugger;
        alert('Moved during a wrong stage ' + stage.kind);
    }
    drawState(cg, state);
}

function setStage(state, stage) {
    state.stage = stage;
    console.log('set', stage.kind);
}

function deletePiece(cg, state: ChesstrailState, pieceId: PieceId, deleteCg) {
    const trail = state.trails.get(pieceId) as Trail;
    const key = trail[trail.length - 1];
    for (const key of trail) {
        state.trailMap.delete(key);
    }
    state.pieceIds.delete(key);
    state.trails.delete(pieceId);
    if (deleteCg) {
        cg.state.pieces.delete(key);
    }
}

// Is called from onmove and on choosing trail. The piece at orig may not exist on the board.
function growTrail(cg: Api, state: ChesstrailState, pieceId: PieceId, trail: Key[], captured: boolean) {
    const dest = trail[trail.length - 1];
    const piece = cg.state.pieces.get(dest) as Piece;

    const endMove = () => {
        if (isPawnPromoted(cg, trail)) {
            anim(state => state.pieces.set(dest, {role: 'queen', color: piece.color, promoted: true}), cg.state);
        }
        playOtherSide(cg, state);
        setStage(state, {kind: 'MoveOrPlace', oldLastMove: cg.state.lastMove});
    }

    state.pieceIds.delete(trail[0]);
    const intersectionSquare = trail.slice(1).find(key => state.trailMap.has(key));

    if (!intersectionSquare) {
        setPieceTrail(state, pieceId, trail);
        state.pieceIds.set(dest, pieceId);
        endMove();
        return;
    }

    const intersectedPieceId = state.trailMap.get(intersectionSquare) as PieceId;
    const intersectedTrail = state.trails.get(intersectedPieceId) as Trail;
    const intersectedPiece = cg.state.pieces.get(
        intersectedPieceId == pieceId ? dest : intersectedTrail[intersectedTrail.length - 1]
    ) as Piece;

    let candidateTrails: Trail[];
    deletePiece(cg, state, intersectedPieceId, true);

    if (intersectedPieceId == pieceId) {
        // A piece can follow in its own trail or intersect it many times.
        // So, we can have more than one trail.
        candidateTrails = splitSelfTrail(intersectedTrail, trail)
            .filter(t => isValidSubTrail(t));
        if (captured) {
            // If a piece intersected its own path and captured,
            // it must stay on the square where the capture happened.
            candidateTrails = [candidateTrails[candidateTrails.length - 1]];
        }
    } else {
        // If the piece does not intersect its own path, it ends up at its destination
        state.pieceIds.set(dest, pieceId);
        const before = intersectedTrail.slice(0, intersectedTrail.indexOf(intersectionSquare));
        const after = intersectedTrail.slice(intersectedTrail.indexOf(intersectionSquare) + 1);
        candidateTrails = [before, after].filter(t => isValidSubTrail(t));
    }

    if (intersectedPieceId != pieceId) {
        setPieceTrail(state, pieceId, trail);
    }
    if (candidateTrails.length == 0) {
        endMove();
    } else if (candidateTrails.length == 1) {
        const trail = candidateTrails[0];
        const dest = trail[trail.length - 1];
        placePieceCG(cg, intersectedPiece, dest);
        state.pieceIds.set(dest, intersectedPieceId);
        setPieceTrail(state, intersectedPieceId, trail);
        endMove();
    } else {
        cg.set({movable: {dests: new Map()}});
        if (pieceId == intersectedPieceId) {
            cg.state.pieces.delete(dest);
        }
        setStage(state, {
            kind: 'ChooseTrail',
            trails: candidateTrails,
            piece: intersectedPiece,
            pieceId: intersectedPieceId
        })
    }
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

function validateState(cg, state: ChesstrailState) {
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
    assert('PieceIds and chessground correspond', setEq(new Set(state.pieceIds.keys()), new Set(cg.state.pieces.keys())));
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
    color: Color
}

type PieceId = Number

interface ChesstrailStageMoveOrPlace {
    kind: 'MoveOrPlace'
    // Holds the last move so that it can be restored after taking back a dropped piece
    oldLastMove: Key[]
}

interface ChesstrailStageMovePlacedPiece {
    kind: 'MovePlacedPiece'
    placedAt: Key
    // Holds the last move and destinations so that they can be restored after taking back a dropped piece
    oldDests: Dests
    oldLastMove: Key[]
}

interface ChesstrailStageChooseTrail {
    kind: 'ChooseTrail'
    trails: Trail[]
    oldTrail?: Trail
    piece: Piece
    pieceId: PieceId
}

type ChesstrailStage = ChesstrailStageMoveOrPlace
    | ChesstrailStagePlace
    | ChesstrailStageMovePlacedPiece
    | ChesstrailStageChooseTrail


function placePieceCG(cg, piece: Piece, key: Key) {
    // Update the state directly. The function dropNewPiece changes color and movables.
    cg.state.pieces.set(key, piece);
}

function onSelect(cg, state: ChesstrailState, key: Key) {
    const stage = state.stage;

    if (cg.state.lastMove?.length == 2 && cg.state.lastMove[1] == key) {
        if (stage.kind != 'ChooseTrail') {
            // If onSelect was invoked as a result of the move, let onMove handle the change.
            // We can only indirectly deduce it from the stage. Also, it can be a click selecting a piece.
            return;
        }
    }
    if (stage.kind == 'MovePlacedPiece') {
        if (key == stage.placedAt) {
            if (cg.state.draggable.current?.previouslySelected == stage.placedAt) {
                const piece = cg.state.pieces.get(key);
                deletePiece(cg, state, state.pieceIds.get(key) as number, true);
                cg.set({movable: {dests: stage.oldDests}});
                const playerPieces = state.availablePieces.get(piece.color) as Map<Role, Number>;
                const newPieceCount = playerPieces.get(piece.role) as number + 1;
                playerPieces.set(piece.role, newPieceCount);
                const pieceEl = document.querySelector(`.pocket .${piece.role}.${piece.color}`) as HTMLElement;
                pieceEl.dataset.count = String(newPieceCount);
                cg.state.lastMove = stage.oldLastMove;
                setStage(state, {kind: 'MoveOrPlace', oldLastMove: stage.oldLastMove});
            }
        } else {
            // Dests become undefined after move.
            const isMovingPlacedPiece = cg.state.movable.dests && cg.state.movable.dests.get(stage.placedAt).includes(key);
            if (!isMovingPlacedPiece) {
                cg.selectSquare(stage.placedAt);
            }
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

        placePieceCG(cg, stage.piece, trail[trail.length - 1]);
        state.pieceIds.set(trail[0], stage.pieceId);

        const startTrail = stage.oldTrail ? stage.oldTrail : [trail[0]];
        setPieceTrail(state, stage.pieceId, startTrail);
        growTrail(cg, state, stage.pieceId, trail, false);
    }
    drawState(cg, state);
}

function drawState(cg, state: ChesstrailState) {
    const stage = state.stage;
    console.log(cg.state.turnColor);
    console.log(state.stage.kind);
    console.log('pieceIds', JSON.stringify([...state.pieceIds]));
    console.log('trailMap', JSON.stringify([...state.trailMap]));
    console.log('trails', JSON.stringify([...state.trails]));
    const container = cg.state.dom.elements.container;
    let trailsSvg = container.querySelector('.cg-trails');
    if (!trailsSvg) {
        trailsSvg = setAttributes(createSVG('svg'), {'class': 'cg-trails'});
        trailsSvg.appendChild(createSVG('g'));
        container.appendChild(trailsSvg);
    }

    const trailsToDraw: { trail: Trail, classes: string }[] = [];
    for (const trail of state.trails.values()) {
        const position = trail[trail.length - 1];
        const {color} = cg.state.pieces.get(position);
        trailsToDraw.push({classes: `trail-${color}`, trail});
    }
    if (stage.kind == 'ChooseTrail') {
        stage.trails.forEach(trail =>
            trailsToDraw.push({classes: `trail-choose trail-${stage.piece.color}`, trail})
        );
        if (stage.oldTrail) {
            trailsToDraw.push({classes: `trail-${stage.piece.color}`, trail: stage.oldTrail});
        }
    }
    const shapes: DrawShape[] = [];
    if (stage.kind == 'ChooseTrail') {
        stage.trails.forEach(trail =>
            shapes.push({
                orig: trail[trail.length - 1],
                piece: stage.piece
            }));
    }
    syncTrailsSvg(cg, trailsSvg.querySelector('g'), trailsToDraw);
    cg.setAutoShapes(shapes);
    validateState(cg, state);
}

function drawTrail(cg, classes, trail: Trail): SVGElement {
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
        class: "trail " + classes,
        'stroke-width': lineWidth,
        points: points
    });
}

function syncTrailsSvg(cg, root, trails: { trail: Trail, classes: string }[]) {
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

function isValidFutureTrail(cg, state, piece, trail, allowIntersect, isMoved) {
    // Trail is valid if:
    // If a piece is captured, its trail is ignored in the rules below.
    // A new trail cuts an existing trail when they share one common square.
    // Trail cannot cut more than one trail of a piece, including its own.
    // Trail cannot follow overlap with the trail of another piece.
    // New trail of a piece can overlap with its own trail.
    // A piece can cut its own trail only once too.
    if (trail.length <= 1) {
        // any trail longer than the current square is fine. For the knight too
        return false;
    }

    const dest = trail[trail.length - 1];
    const selfPieceId = state.pieceIds.get(trail[0]);
    let cuttingTrailOfAnotherPiece = 0;
    let cuttingSelf = false;
    const capturedPieceId = state.pieceIds.get(dest);

    for (const s of trail.slice(1)) {
        const pieceId = state.trailMap.get(s);
        if (pieceId == undefined) {
            continue;
        } else if (!allowIntersect) {
            return false;
        }
        const pieceOnTrail = cg.state.pieces.get(s);
        if (pieceOnTrail) {
            if (s != dest) {
                // The trail cannot have any pieces till the end.
                return false;
            } else if (!isMoved && pieceOnTrail.color == piece.color) {
                // Cannot capture piece of own color at the end of the trail.
                // If isValidFutureTrail is called before move, dest has a piece of opposite color
                // that would be captured. If called on move, it would be the piece that moved.
                return false;
            }
        }
        if (pieceId == selfPieceId) {
            cuttingSelf = true;
        } else if (pieceId != capturedPieceId) {
            cuttingTrailOfAnotherPiece++;
        }
        if (cuttingTrailOfAnotherPiece > 1
            || cuttingTrailOfAnotherPiece > 0 && cuttingSelf) {
            return false;
        }
    }
    return true;
}

function isValidSubTrail(trail) {
    // any trail longer than the current square is fine. For the knight too
    return trail.length > 1;
}

function isPawnPromoted(cg, trail) {
    const dest = trail[trail.length - 1];
    if (cg.state.pieces.get(dest).role != 'pawn') {
        return false;
    }
    const [[x1, y1], [x2, y2]] = [trail[0], dest].map(key2pos);
    const [xDelta, yDelta] = [x2 - x1, y2 - y1];
    const getEdgeIndex = delta => delta == 0 ? -1 : (delta < 0 ? 0 : 7);
    const [xEdge, yEdge] = [getEdgeIndex(xDelta), getEdgeIndex(yDelta)];
    if (Math.abs(xDelta) == Math.abs(yDelta)) {
        return x2 == xEdge || y2 == yEdge;
    } else {
        return Math.abs(xDelta) > Math.abs(yDelta) ? x2 == xEdge : y2 == yEdge;
    }
}

function getMoves(cg, state, key: Key, allowCapture, allowIntersect): Key[] {
    const selfPieceId = state.pieceIds.get(key);
    const piece = cg.state.pieces.get(key);
    let moves: Key[];
    if (piece.role == 'pawn') {
        const trail = state.trails.get(selfPieceId);
        if (trail.length == 1) {
            // The first move only depends on the quadrant. No capture.
            const [x, y] = key2pos(key);
            const xSign = x < 4 ? 1 : -1;  // Move toward further edge.
            const ySign = y < 4 ? 1 : -1;
            moves = [[x + 1 * xSign, y], [x + 2 * xSign, y], [x, y + 1 * ySign],
                [x, y + 2 * ySign]].map(pos2key);
        } else {
            // Continue in the direction. If the bounding rectangle of the trail is a square,
            // the pawn can still choose the direction. For example, pawn only moved diagonally with captures.
            const [[x1, y1], [x2, y2]] = [trail[0], trail[trail.length - 1]].map(key2pos);
            const [xDelta, yDelta] = [x2 - x1, y2 - y1];
            const isOnboard = ([x, y]) => x >= 0 && x < 8 && y >= 0 && y < 8;
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
            moves = pawnMoves.filter(([pos, _]) => isOnboard(pos))
                .filter(([pos, capture]) => cg.state.pieces.has(pos2key(pos)) ? capture : !capture)
                .map(([pos, _]) => pos2key(pos));
            moves = [...new Set([...moves])]; // x and y may overlap.
        }
    } else {
        moves = premove(cg.state.pieces, key, false);
    }
    return moves.filter(m => allowCapture || !cg.state.pieces.has(m))
        .filter(m => getTrailsForMove(piece.role, key, m).some(t => isValidFutureTrail(cg, state, piece, t, allowIntersect, false)));
}

function makePlacementListener(cg, state) {
    const placementChoice = document.querySelector('.pocket-bottom');
    if (placementChoice == null) {
        throw Error('Cannot find placement choice element');
    }

    function doit(rootEl, color) {
        for (const [role, count] of state.availablePieces.get(color).entries()) {
            const c1 = document.createElement('div');
            rootEl.insertBefore(c1, null);
            c1.classList.add('pocket-c1');
            const c2 = document.createElement('div');
            c1.insertBefore(c2, null);
            c2.classList.add('pocket-c2');
            const piece = document.createElement('piece');
            c2.insertBefore(piece, null);
            piece.classList.add(role, color);
            piece.dataset.role = role;
            piece.dataset.color = color;
            piece.dataset.count = count;
        }
    }

    doit(document.querySelector('.pocket-bottom'), 'white');
    doit(document.querySelector('.pocket-top'), 'black');
    for (const evType of ['mousedown', 'touchstart']) {
        document.querySelectorAll('.pocket').forEach(el =>
            el.addEventListener(evType, drag));
    }

    function drag(e: cg.MouchEvent): void {
        if (e.button !== undefined && e.button !== 0) return; // only touch or left click
        const el = e.target as HTMLElement,
            role = el.getAttribute('data-role') as cg.Role,
            color = el.getAttribute('data-color') as cg.Color,
            count = el.getAttribute('data-count');
        if (!role || !color || count === '0') return;
        if (color !== state.color) return;
        e.stopPropagation();
        e.preventDefault();
        dragNewPiece(cg.state, {color, role}, e);
    }

    // function preloadMouseIcons(data: RoundData) {
    //     const colorKey = data.player.color[0];
    //     for (const colorKey of 'bw') {
    //         for (const pKey of 'PNBRQ') fetch(`ass/cburnett/${colorKey}${pKey}.svg`));
    //     }
    // }
}


type Trail = Key[];

function playOtherSide(cg: Api, state: ChesstrailState) {
    const color = state.color == 'white' ? 'black' : 'white';
    state.color = color;
    cg.set({
        turnColor: color,
        movable: {
            color: color,
            dests: getAllMoves(cg, state)
        }
    });
}

function getAllMoves(cg, state: ChesstrailState): Map<Key, Key[]> {
    const dests = new Map();
    for (const s of cg.state.pieces.keys()) {
        const moves = getMoves(cg, state, s, true, true);
        if (moves.length) dests.set(s, moves);
    }
    return dests;
}
