import {Chessground} from 'chessground';
import {DrawShape} from 'chessground/draw';
import {Api} from 'chessground/api';
import {anim} from 'chessground/anim';
import {key2pos, pos2key} from 'chessground/util';
import {Key, Color, Role, Piece, Dests} from 'chessground/types';
import {dropNewPiece} from 'chessground/board';
import {premove} from 'chessground/premove';

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
Last move should be only for the piece that moved. TODO

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
            movable: {
                showDests: true,
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
                move: (orig, dest) => onMove(cg, chesstrailState, orig, dest),
                select: key => onSelect(cg, chesstrailState, key)
            }
        });
        makePlacementListener(cg, chesstrailState);
        return cg;
    }
};

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
            debugger;
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
        setStage(state, {kind: 'MoveOrPlace'});
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
}

interface ChesstrailStagePlace {
    kind: 'Place'
    placeAt: Key
    availablePieces: Map<Role, Number>
    color: Color
}

interface ChesstrailStageMovePlacedPiece {
    kind: 'MovePlacedPiece'
    placedAt: Key
    oldDests: Dests
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
    cg.state.pieces.set('a0', piece);
    // dropNewPiece changes color. Restore it.
    dropNewPiece(cg.state, 'a0', key, true);
    cg.state.turnColor = piece.color;
}

function onSelect(cg, state: ChesstrailState, key: Key) {
    const color = cg.state.turnColor;
    const stage = state.stage;

    if (cg.state.lastMove?.length == 2 && cg.state.lastMove[1] == key) {
        if (stage.kind != 'Place' && stage.kind != 'ChooseTrail') {
            // If onSelect was invoked as a result of the move, let onMove handle the change.
            // We can only indirectly deduce it from the stage. Also, it can be a click selecting a piece.
            return;
        }
    }
    if (stage.kind == 'MoveOrPlace') {
        if (state.trailMap.has(key)) {
            // Cannot place on a square that has a piece or trail of another piece.
            // There are two clicks when moving: on the first one the square has a piece
            // On the second one, this listener is called when the piece is already moved there.
            return;
        }

        const availablePieces = state.availablePieces.get(color) as Map<Role, Number>;

        setStage(state, {
            kind: 'Place',
            color,
            availablePieces,
            placeAt: key
        });
    } else if (stage.kind == 'Place') {
        alert('Wrong place');
    } else if (stage.kind == 'MovePlacedPiece') {
        if (key == stage.placedAt) {
            if (cg.state.draggable.current?.previouslySelected == stage.placedAt) {
                const piece = cg.state.pieces.get(key);
                deletePiece(cg, state, state.pieceIds.get(key) as number, true);
                cg.set({movable: {dests: stage.oldDests}});
                const playerPieces = state.availablePieces.get(piece.color) as Map<Role, Number>;
                const pieceCount = playerPieces.get(piece.role) as number;
                playerPieces.set(piece.role, pieceCount + 1);
                setStage(state, {kind: 'MoveOrPlace'});
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
    const shapes: DrawShape[] = drawTrails(cg, state.trails);
    if (stage.kind == 'Place') {
        // TODO: https://github.com/ornicar/lila/blob/master/ui/analyse/src/promotion.ts
        displayChoice(cg, stage.placeAt, stage.color, stage.availablePieces);
    } else if (stage.kind == 'ChooseTrail') {
        stage.trails.forEach(trail =>
            shapes.push(...drawTrail('paleGreen', trail)));
        if (stage.oldTrail) {
            shapes.push(...drawTrail(stage.piece.color, stage.oldTrail));
        }
    }
    if (stage.kind == 'ChooseTrail') {
        stage.trails.forEach(trail =>
            shapes.push({
                orig: trail[trail.length - 1],
                piece: stage.piece
            }));
    }
    // shapes.push({ orig: 'e2', dest: 'a8', brush: 'black'});
    cg.setAutoShapes(shapes);
    validateState(cg, state);
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

function displayChoice(cg, placeAt: Key, color: Color, pieces: Map<Role, Number>): void {
    const placementChoice = document.getElementById('placement-choice');
    if (placementChoice == null) {
        throw Error('Cannot find placement choice element');
    }
    let left = (7 - key2pos(placeAt)[0]) * 12.5;
    const orientation: Color = cg.state.orientation;
    if (orientation === 'white') left = 87.5 - left;
    // const startingRank = Math.min(5, 8 - key2pos(placeAt)[1]); // We always display five pieces.
    // const vertical = color === orientation ? 'top' : 'bottom';

    placementChoice.classList.add('active');
    placementChoice.classList.add(color);
    let i = 0;
    for (const [role, count] of pieces) {
        // const top = (color === orientation ? i : 7 - i) * 12.5;
        const top = i * 12.5;
        i++;
        const pieceEl = placementChoice.querySelector(`piece.${role}.${color}`) as Element;
        const squareEl = pieceEl.parentNode as HTMLElement;
        squareEl.dataset.count = count.toString();
        squareEl.classList.add('active');
        squareEl.style.top = `${top}%`;
        squareEl.style.left = `${left}%`;
    }
}

function makePlacementListener(cg, state) {
    const placementChoice = document.getElementById('placement-choice');
    if (placementChoice == null) {
        throw Error('Cannot find placement choice element');
    }

    function hidePlacement() {
        if (placementChoice == null) {
            throw Error('Cannot find placement choice element');
        }
        placementChoice.classList.remove('active');
        placementChoice.querySelectorAll('square.active').forEach(square =>
            square.classList.remove('active')
        );
    }

    function makeListener(piece) {
        return ev => {
            ev.stopImmediatePropagation();
            const stage = state.stage;
            if (stage.kind != 'Place') {
                alert('The stage should be Place');
            }
            const playerPieces = state.availablePieces.get(piece.color) as Map<Role, Number>;
            const pieceCount = playerPieces.get(piece.role) as number;
            if (pieceCount < 1) {
                return;
            }
            playerPieces.set(piece.role, pieceCount - 1);
            const pieceId = state.pieceIdCounter++;
            const oldDests = cg.state.movable.dests;  // it needs to be saved before placing piece
            placePieceCG(cg, piece, stage.placeAt);
            state.pieceIds.set(stage.placeAt, pieceId);
            setPieceTrail(state, pieceId, [stage.placeAt]);
            const dests = new Map([[stage.placeAt, getMoves(cg, state, stage.placeAt, false, false)]]);
            cg.set({movable: {dests: dests}});
            cg.selectSquare(stage.placeAt);
            hidePlacement();
            setStage(state, {
                kind: 'MovePlacedPiece',
                oldDests: oldDests,
                placedAt: stage.placeAt
            });
        }
    }

    for (const color of ['white', 'black']) {
        for (const role of makeStartingPieces().keys()) {
            const piece = {role, color};
            const pieceEl = document.createElement('piece');
            pieceEl.classList.add(role, color);
            const squareEl = document.createElement('square');
            squareEl.insertBefore(pieceEl, null);
            placementChoice.insertBefore(squareEl, null);
            squareEl.addEventListener('click', makeListener(piece));
        }
    }
    placementChoice.addEventListener('click', () => {
        setStage(state, {kind: 'MoveOrPlace'});
        hidePlacement();
    });
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
