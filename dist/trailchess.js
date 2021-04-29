(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.TrailChess = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.render = exports.anim = void 0;
const util = require("./util");
function anim(mutation, state) {
    return state.animation.enabled ? animate(mutation, state) : render(mutation, state);
}
exports.anim = anim;
function render(mutation, state) {
    const result = mutation(state);
    state.dom.redraw();
    return result;
}
exports.render = render;
function makePiece(key, piece) {
    return {
        key: key,
        pos: util.key2pos(key),
        piece: piece,
    };
}
function closer(piece, pieces) {
    return pieces.sort((p1, p2) => {
        return util.distanceSq(piece.pos, p1.pos) - util.distanceSq(piece.pos, p2.pos);
    })[0];
}
function computePlan(prevPieces, current) {
    const anims = new Map(), animedOrigs = [], fadings = new Map(), missings = [], news = [], prePieces = new Map();
    let curP, preP, vector;
    for (const [k, p] of prevPieces) {
        prePieces.set(k, makePiece(k, p));
    }
    for (const key of util.allKeys) {
        curP = current.pieces.get(key);
        preP = prePieces.get(key);
        if (curP) {
            if (preP) {
                if (!util.samePiece(curP, preP.piece)) {
                    missings.push(preP);
                    news.push(makePiece(key, curP));
                }
            }
            else
                news.push(makePiece(key, curP));
        }
        else if (preP)
            missings.push(preP);
    }
    for (const newP of news) {
        preP = closer(newP, missings.filter(p => util.samePiece(newP.piece, p.piece)));
        if (preP) {
            vector = [preP.pos[0] - newP.pos[0], preP.pos[1] - newP.pos[1]];
            anims.set(newP.key, vector.concat(vector));
            animedOrigs.push(preP.key);
        }
    }
    for (const p of missings) {
        if (!animedOrigs.includes(p.key))
            fadings.set(p.key, p.piece);
    }
    return {
        anims: anims,
        fadings: fadings,
    };
}
function step(state, now) {
    const cur = state.animation.current;
    if (cur === undefined) {
        if (!state.dom.destroyed)
            state.dom.redrawNow();
        return;
    }
    const rest = 1 - (now - cur.start) * cur.frequency;
    if (rest <= 0) {
        state.animation.current = undefined;
        state.dom.redrawNow();
    }
    else {
        const ease = easing(rest);
        for (const cfg of cur.plan.anims.values()) {
            cfg[2] = cfg[0] * ease;
            cfg[3] = cfg[1] * ease;
        }
        state.dom.redrawNow(true);
        requestAnimationFrame((now = performance.now()) => step(state, now));
    }
}
function animate(mutation, state) {
    const prevPieces = new Map(state.pieces);
    const result = mutation(state);
    const plan = computePlan(prevPieces, state);
    if (plan.anims.size || plan.fadings.size) {
        const alreadyRunning = state.animation.current && state.animation.current.start;
        state.animation.current = {
            start: performance.now(),
            frequency: 1 / state.animation.duration,
            plan: plan,
        };
        if (!alreadyRunning)
            step(state, performance.now());
    }
    else {
        state.dom.redraw();
    }
    return result;
}
function easing(t) {
    return t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;
}

},{"./util":17}],2:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.start = void 0;
const board = require("./board");
const fen_1 = require("./fen");
const config_1 = require("./config");
const anim_1 = require("./anim");
const drag_1 = require("./drag");
const explosion_1 = require("./explosion");
function start(state, redrawAll) {
    function toggleOrientation() {
        board.toggleOrientation(state);
        redrawAll();
    }
    return {
        set(config) {
            if (config.orientation && config.orientation !== state.orientation)
                toggleOrientation();
            (config.fen ? anim_1.anim : anim_1.render)(state => config_1.configure(state, config), state);
        },
        state,
        getFen: () => fen_1.write(state.pieces),
        toggleOrientation,
        setPieces(pieces) {
            anim_1.anim(state => board.setPieces(state, pieces), state);
        },
        selectSquare(key, force) {
            if (key)
                anim_1.anim(state => board.selectSquare(state, key, force), state);
            else if (state.selected) {
                board.unselect(state);
                state.dom.redraw();
            }
        },
        move(orig, dest) {
            anim_1.anim(state => board.baseMove(state, orig, dest), state);
        },
        newPiece(piece, key) {
            anim_1.anim(state => board.baseNewPiece(state, piece, key), state);
        },
        playPremove() {
            if (state.premovable.current) {
                if (anim_1.anim(board.playPremove, state))
                    return true;
                state.dom.redraw();
            }
            return false;
        },
        playPredrop(validate) {
            if (state.predroppable.current) {
                const result = board.playPredrop(state, validate);
                state.dom.redraw();
                return result;
            }
            return false;
        },
        cancelPremove() {
            anim_1.render(board.unsetPremove, state);
        },
        cancelPredrop() {
            anim_1.render(board.unsetPredrop, state);
        },
        cancelMove() {
            anim_1.render(state => {
                board.cancelMove(state);
                drag_1.cancel(state);
            }, state);
        },
        stop() {
            anim_1.render(state => {
                board.stop(state);
                drag_1.cancel(state);
            }, state);
        },
        explode(keys) {
            explosion_1.explosion(state, keys);
        },
        setAutoShapes(shapes) {
            anim_1.render(state => (state.drawable.autoShapes = shapes), state);
        },
        setShapes(shapes) {
            anim_1.render(state => (state.drawable.shapes = shapes), state);
        },
        getKeyAtDomPos(pos) {
            return board.getKeyAtDomPos(pos, board.whitePov(state), state.dom.bounds());
        },
        redrawAll,
        dragNewPiece(piece, event, force) {
            drag_1.dragNewPiece(state, piece, event, force);
        },
        destroy() {
            board.stop(state);
            state.dom.unbind && state.dom.unbind();
            state.dom.destroyed = true;
        },
    };
}
exports.start = start;

},{"./anim":1,"./board":3,"./config":5,"./drag":6,"./explosion":10,"./fen":11}],3:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.whitePov = exports.getSnappedKeyAtDomPos = exports.getKeyAtDomPos = exports.stop = exports.cancelMove = exports.playPredrop = exports.playPremove = exports.isDraggable = exports.canMove = exports.unselect = exports.setSelected = exports.selectSquare = exports.dropNewPiece = exports.userMove = exports.baseNewPiece = exports.baseMove = exports.unsetPredrop = exports.unsetPremove = exports.setCheck = exports.setPieces = exports.reset = exports.toggleOrientation = exports.callUserFunction = void 0;
const util_1 = require("./util");
const premove_1 = require("./premove");
function callUserFunction(f, ...args) {
    if (f)
        setTimeout(() => f(...args), 1);
}
exports.callUserFunction = callUserFunction;
function toggleOrientation(state) {
    state.orientation = util_1.opposite(state.orientation);
    state.animation.current = state.draggable.current = state.selected = undefined;
}
exports.toggleOrientation = toggleOrientation;
function reset(state) {
    state.lastMove = undefined;
    unselect(state);
    unsetPremove(state);
    unsetPredrop(state);
}
exports.reset = reset;
function setPieces(state, pieces) {
    for (const [key, piece] of pieces) {
        if (piece)
            state.pieces.set(key, piece);
        else
            state.pieces.delete(key);
    }
}
exports.setPieces = setPieces;
function setCheck(state, color) {
    state.check = undefined;
    if (color === true)
        color = state.turnColor;
    if (color)
        for (const [k, p] of state.pieces) {
            if (p.role === 'king' && p.color === color) {
                state.check = k;
            }
        }
}
exports.setCheck = setCheck;
function setPremove(state, orig, dest, meta) {
    unsetPredrop(state);
    state.premovable.current = [orig, dest];
    callUserFunction(state.premovable.events.set, orig, dest, meta);
}
function unsetPremove(state) {
    if (state.premovable.current) {
        state.premovable.current = undefined;
        callUserFunction(state.premovable.events.unset);
    }
}
exports.unsetPremove = unsetPremove;
function setPredrop(state, role, key) {
    unsetPremove(state);
    state.predroppable.current = { role, key };
    callUserFunction(state.predroppable.events.set, role, key);
}
function unsetPredrop(state) {
    const pd = state.predroppable;
    if (pd.current) {
        pd.current = undefined;
        callUserFunction(pd.events.unset);
    }
}
exports.unsetPredrop = unsetPredrop;
function tryAutoCastle(state, orig, dest) {
    if (!state.autoCastle)
        return false;
    const king = state.pieces.get(orig);
    if (!king || king.role !== 'king')
        return false;
    const origPos = util_1.key2pos(orig);
    const destPos = util_1.key2pos(dest);
    if ((origPos[1] !== 0 && origPos[1] !== 7) || origPos[1] !== destPos[1])
        return false;
    if (origPos[0] === 4 && !state.pieces.has(dest)) {
        if (destPos[0] === 6)
            dest = util_1.pos2key([7, destPos[1]]);
        else if (destPos[0] === 2)
            dest = util_1.pos2key([0, destPos[1]]);
    }
    const rook = state.pieces.get(dest);
    if (!rook || rook.color !== king.color || rook.role !== 'rook')
        return false;
    state.pieces.delete(orig);
    state.pieces.delete(dest);
    if (origPos[0] < destPos[0]) {
        state.pieces.set(util_1.pos2key([6, destPos[1]]), king);
        state.pieces.set(util_1.pos2key([5, destPos[1]]), rook);
    }
    else {
        state.pieces.set(util_1.pos2key([2, destPos[1]]), king);
        state.pieces.set(util_1.pos2key([3, destPos[1]]), rook);
    }
    return true;
}
function baseMove(state, orig, dest) {
    const origPiece = state.pieces.get(orig), destPiece = state.pieces.get(dest);
    if (orig === dest || !origPiece)
        return false;
    const captured = destPiece && destPiece.color !== origPiece.color ? destPiece : undefined;
    if (dest === state.selected)
        unselect(state);
    callUserFunction(state.events.move, orig, dest, captured);
    if (!tryAutoCastle(state, orig, dest)) {
        state.pieces.set(dest, origPiece);
        state.pieces.delete(orig);
    }
    state.lastMove = [orig, dest];
    state.check = undefined;
    callUserFunction(state.events.change);
    return captured || true;
}
exports.baseMove = baseMove;
function baseNewPiece(state, piece, key, force) {
    if (state.pieces.has(key)) {
        if (force)
            state.pieces.delete(key);
        else
            return false;
    }
    callUserFunction(state.events.dropNewPiece, piece, key);
    state.pieces.set(key, piece);
    state.lastMove = [key];
    state.check = undefined;
    callUserFunction(state.events.change);
    state.movable.dests = undefined;
    state.turnColor = util_1.opposite(state.turnColor);
    return true;
}
exports.baseNewPiece = baseNewPiece;
function baseUserMove(state, orig, dest) {
    const result = baseMove(state, orig, dest);
    if (result) {
        state.movable.dests = undefined;
        state.turnColor = util_1.opposite(state.turnColor);
        state.animation.current = undefined;
    }
    return result;
}
function userMove(state, orig, dest) {
    if (canMove(state, orig, dest)) {
        const result = baseUserMove(state, orig, dest);
        if (result) {
            const holdTime = state.hold.stop();
            unselect(state);
            const metadata = {
                premove: false,
                ctrlKey: state.stats.ctrlKey,
                holdTime,
            };
            if (result !== true)
                metadata.captured = result;
            callUserFunction(state.movable.events.after, orig, dest, metadata);
            return true;
        }
    }
    else if (canPremove(state, orig, dest)) {
        setPremove(state, orig, dest, {
            ctrlKey: state.stats.ctrlKey,
        });
        unselect(state);
        return true;
    }
    unselect(state);
    return false;
}
exports.userMove = userMove;
function dropNewPiece(state, orig, dest, force) {
    const piece = state.pieces.get(orig);
    if (piece && (canDrop(state, orig, dest) || force)) {
        state.pieces.delete(orig);
        baseNewPiece(state, piece, dest, force);
        callUserFunction(state.movable.events.afterNewPiece, piece.role, dest, {
            premove: false,
            predrop: false,
        });
    }
    else if (piece && canPredrop(state, orig, dest)) {
        setPredrop(state, piece.role, dest);
    }
    else {
        unsetPremove(state);
        unsetPredrop(state);
    }
    state.pieces.delete(orig);
    unselect(state);
}
exports.dropNewPiece = dropNewPiece;
function selectSquare(state, key, force) {
    callUserFunction(state.events.select, key);
    if (state.selected) {
        if (state.selected === key && !state.draggable.enabled) {
            unselect(state);
            state.hold.cancel();
            return;
        }
        else if ((state.selectable.enabled || force) && state.selected !== key) {
            if (userMove(state, state.selected, key)) {
                state.stats.dragged = false;
                return;
            }
        }
    }
    if (isMovable(state, key) || isPremovable(state, key)) {
        setSelected(state, key);
        state.hold.start();
    }
}
exports.selectSquare = selectSquare;
function setSelected(state, key) {
    state.selected = key;
    if (isPremovable(state, key)) {
        state.premovable.dests = premove_1.premove(state.pieces, key, state.premovable.castle);
    }
    else
        state.premovable.dests = undefined;
}
exports.setSelected = setSelected;
function unselect(state) {
    state.selected = undefined;
    state.premovable.dests = undefined;
    state.hold.cancel();
}
exports.unselect = unselect;
function isMovable(state, orig) {
    const piece = state.pieces.get(orig);
    return (!!piece &&
        (state.movable.color === 'both' || (state.movable.color === piece.color && state.turnColor === piece.color)));
}
function canMove(state, orig, dest) {
    var _a, _b;
    return (orig !== dest && isMovable(state, orig) && (state.movable.free || !!((_b = (_a = state.movable.dests) === null || _a === void 0 ? void 0 : _a.get(orig)) === null || _b === void 0 ? void 0 : _b.includes(dest))));
}
exports.canMove = canMove;
function canDrop(state, orig, dest) {
    const piece = state.pieces.get(orig);
    return (!!piece &&
        (orig === dest || !state.pieces.has(dest)) &&
        (state.movable.color === 'both' || (state.movable.color === piece.color && state.turnColor === piece.color)));
}
function isPremovable(state, orig) {
    const piece = state.pieces.get(orig);
    return !!piece && state.premovable.enabled && state.movable.color === piece.color && state.turnColor !== piece.color;
}
function canPremove(state, orig, dest) {
    return (orig !== dest && isPremovable(state, orig) && premove_1.premove(state.pieces, orig, state.premovable.castle).includes(dest));
}
function canPredrop(state, orig, dest) {
    const piece = state.pieces.get(orig);
    const destPiece = state.pieces.get(dest);
    return (!!piece &&
        (!destPiece || destPiece.color !== state.movable.color) &&
        state.predroppable.enabled &&
        (piece.role !== 'pawn' || (dest[1] !== '1' && dest[1] !== '8')) &&
        state.movable.color === piece.color &&
        state.turnColor !== piece.color);
}
function isDraggable(state, orig) {
    const piece = state.pieces.get(orig);
    return (!!piece &&
        state.draggable.enabled &&
        (state.movable.color === 'both' ||
            (state.movable.color === piece.color && (state.turnColor === piece.color || state.premovable.enabled))));
}
exports.isDraggable = isDraggable;
function playPremove(state) {
    const move = state.premovable.current;
    if (!move)
        return false;
    const orig = move[0], dest = move[1];
    let success = false;
    if (canMove(state, orig, dest)) {
        const result = baseUserMove(state, orig, dest);
        if (result) {
            const metadata = { premove: true };
            if (result !== true)
                metadata.captured = result;
            callUserFunction(state.movable.events.after, orig, dest, metadata);
            success = true;
        }
    }
    unsetPremove(state);
    return success;
}
exports.playPremove = playPremove;
function playPredrop(state, validate) {
    const drop = state.predroppable.current;
    let success = false;
    if (!drop)
        return false;
    if (validate(drop)) {
        const piece = {
            role: drop.role,
            color: state.movable.color,
        };
        if (baseNewPiece(state, piece, drop.key)) {
            callUserFunction(state.movable.events.afterNewPiece, drop.role, drop.key, {
                premove: false,
                predrop: true,
            });
            success = true;
        }
    }
    unsetPredrop(state);
    return success;
}
exports.playPredrop = playPredrop;
function cancelMove(state) {
    unsetPremove(state);
    unsetPredrop(state);
    unselect(state);
}
exports.cancelMove = cancelMove;
function stop(state) {
    state.movable.color = state.movable.dests = state.animation.current = undefined;
    cancelMove(state);
}
exports.stop = stop;
function getKeyAtDomPos(pos, asWhite, bounds) {
    let file = Math.floor((8 * (pos[0] - bounds.left)) / bounds.width);
    if (!asWhite)
        file = 7 - file;
    let rank = 7 - Math.floor((8 * (pos[1] - bounds.top)) / bounds.height);
    if (!asWhite)
        rank = 7 - rank;
    return file >= 0 && file < 8 && rank >= 0 && rank < 8 ? util_1.pos2key([file, rank]) : undefined;
}
exports.getKeyAtDomPos = getKeyAtDomPos;
function getSnappedKeyAtDomPos(orig, pos, asWhite, bounds) {
    const origPos = util_1.key2pos(orig);
    const validSnapPos = util_1.allPos.filter(pos2 => {
        return premove_1.queen(origPos[0], origPos[1], pos2[0], pos2[1]) || premove_1.knight(origPos[0], origPos[1], pos2[0], pos2[1]);
    });
    const validSnapCenters = validSnapPos.map(pos2 => util_1.computeSquareCenter(util_1.pos2key(pos2), asWhite, bounds));
    const validSnapDistances = validSnapCenters.map(pos2 => util_1.distanceSq(pos, pos2));
    const [, closestSnapIndex] = validSnapDistances.reduce((a, b, index) => (a[0] < b ? a : [b, index]), [
        validSnapDistances[0],
        0,
    ]);
    return util_1.pos2key(validSnapPos[closestSnapIndex]);
}
exports.getSnappedKeyAtDomPos = getSnappedKeyAtDomPos;
function whitePov(s) {
    return s.orientation === 'white';
}
exports.whitePov = whitePov;

},{"./premove":12,"./util":17}],4:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Chessground = void 0;
const api_1 = require("./api");
const config_1 = require("./config");
const state_1 = require("./state");
const wrap_1 = require("./wrap");
const events = require("./events");
const render_1 = require("./render");
const svg = require("./svg");
const util = require("./util");
function Chessground(element, config) {
    const maybeState = state_1.defaults();
    config_1.configure(maybeState, config || {});
    function redrawAll() {
        const prevUnbind = 'dom' in maybeState ? maybeState.dom.unbind : undefined;
        const relative = maybeState.viewOnly && !maybeState.drawable.visible, elements = wrap_1.renderWrap(element, maybeState, relative), bounds = util.memo(() => elements.board.getBoundingClientRect()), redrawNow = (skipSvg) => {
            render_1.render(state);
            if (!skipSvg && elements.svg)
                svg.renderSvg(state, elements.svg, elements.customSvg);
        }, boundsUpdated = () => {
            bounds.clear();
            render_1.updateBounds(state);
            if (elements.svg)
                svg.renderSvg(state, elements.svg, elements.customSvg);
        };
        const state = maybeState;
        state.dom = {
            elements,
            bounds,
            redraw: debounceRedraw(redrawNow),
            redrawNow,
            unbind: prevUnbind,
            relative,
        };
        state.drawable.prevSvgHash = '';
        redrawNow(false);
        events.bindBoard(state, boundsUpdated);
        if (!prevUnbind)
            state.dom.unbind = events.bindDocument(state, boundsUpdated);
        state.events.insert && state.events.insert(elements);
        return state;
    }
    return api_1.start(redrawAll(), redrawAll);
}
exports.Chessground = Chessground;
function debounceRedraw(redrawNow) {
    let redrawing = false;
    return () => {
        if (redrawing)
            return;
        redrawing = true;
        requestAnimationFrame(() => {
            redrawNow();
            redrawing = false;
        });
    };
}

},{"./api":2,"./config":5,"./events":9,"./render":13,"./state":14,"./svg":15,"./util":17,"./wrap":18}],5:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configure = void 0;
const board_1 = require("./board");
const fen_1 = require("./fen");
function configure(state, config) {
    var _a;
    if ((_a = config.movable) === null || _a === void 0 ? void 0 : _a.dests)
        state.movable.dests = undefined;
    merge(state, config);
    if (config.fen) {
        state.pieces = fen_1.read(config.fen);
        state.drawable.shapes = [];
    }
    if (config.hasOwnProperty('check'))
        board_1.setCheck(state, config.check || false);
    if (config.hasOwnProperty('lastMove') && !config.lastMove)
        state.lastMove = undefined;
    else if (config.lastMove)
        state.lastMove = config.lastMove;
    if (state.selected)
        board_1.setSelected(state, state.selected);
    if (!state.animation.duration || state.animation.duration < 100)
        state.animation.enabled = false;
    if (!state.movable.rookCastle && state.movable.dests) {
        const rank = state.movable.color === 'white' ? '1' : '8', kingStartPos = ('e' + rank), dests = state.movable.dests.get(kingStartPos), king = state.pieces.get(kingStartPos);
        if (!dests || !king || king.role !== 'king')
            return;
        state.movable.dests.set(kingStartPos, dests.filter(d => !(d === 'a' + rank && dests.includes(('c' + rank))) &&
            !(d === 'h' + rank && dests.includes(('g' + rank)))));
    }
}
exports.configure = configure;
function merge(base, extend) {
    for (const key in extend) {
        if (isObject(base[key]) && isObject(extend[key]))
            merge(base[key], extend[key]);
        else
            base[key] = extend[key];
    }
}
function isObject(o) {
    return typeof o === 'object';
}

},{"./board":3,"./fen":11}],6:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancel = exports.end = exports.move = exports.dragNewPiece = exports.start = void 0;
const board = require("./board");
const util = require("./util");
const draw_1 = require("./draw");
const anim_1 = require("./anim");
function start(s, e) {
    if (!e.isTrusted || (e.button !== undefined && e.button !== 0))
        return;
    if (e.touches && e.touches.length > 1)
        return;
    const bounds = s.dom.bounds(), position = util.eventPosition(e), orig = board.getKeyAtDomPos(position, board.whitePov(s), bounds);
    if (!orig)
        return;
    const piece = s.pieces.get(orig);
    const previouslySelected = s.selected;
    if (!previouslySelected && s.drawable.enabled && (s.drawable.eraseOnClick || !piece || piece.color !== s.turnColor))
        draw_1.clear(s);
    if (e.cancelable !== false &&
        (!e.touches || !s.movable.color || piece || previouslySelected || pieceCloseTo(s, position)))
        e.preventDefault();
    const hadPremove = !!s.premovable.current;
    const hadPredrop = !!s.predroppable.current;
    s.stats.ctrlKey = e.ctrlKey;
    if (s.selected && board.canMove(s, s.selected, orig)) {
        anim_1.anim(state => board.selectSquare(state, orig), s);
    }
    else {
        board.selectSquare(s, orig);
    }
    const stillSelected = s.selected === orig;
    const element = pieceElementByKey(s, orig);
    if (piece && element && stillSelected && board.isDraggable(s, orig)) {
        s.draggable.current = {
            orig,
            piece,
            origPos: position,
            pos: position,
            started: s.draggable.autoDistance && s.stats.dragged,
            element,
            previouslySelected,
            originTarget: e.target,
        };
        element.cgDragging = true;
        element.classList.add('dragging');
        const ghost = s.dom.elements.ghost;
        if (ghost) {
            ghost.className = `ghost ${piece.color} ${piece.role}`;
            util.translateAbs(ghost, util.posToTranslateAbs(bounds)(util.key2pos(orig), board.whitePov(s)));
            util.setVisible(ghost, true);
        }
        processDrag(s);
    }
    else {
        if (hadPremove)
            board.unsetPremove(s);
        if (hadPredrop)
            board.unsetPredrop(s);
    }
    s.dom.redraw();
}
exports.start = start;
function pieceCloseTo(s, pos) {
    const asWhite = board.whitePov(s), bounds = s.dom.bounds(), radiusSq = Math.pow(bounds.width / 8, 2);
    for (const key in s.pieces) {
        const center = util.computeSquareCenter(key, asWhite, bounds);
        if (util.distanceSq(center, pos) <= radiusSq)
            return true;
    }
    return false;
}
function dragNewPiece(s, piece, e, force) {
    const key = 'a0';
    s.pieces.set(key, piece);
    s.dom.redraw();
    const position = util.eventPosition(e);
    s.draggable.current = {
        orig: key,
        piece,
        origPos: position,
        pos: position,
        started: true,
        element: () => pieceElementByKey(s, key),
        originTarget: e.target,
        newPiece: true,
        force: !!force,
    };
    processDrag(s);
}
exports.dragNewPiece = dragNewPiece;
function processDrag(s) {
    requestAnimationFrame(() => {
        var _a;
        const cur = s.draggable.current;
        if (!cur)
            return;
        if ((_a = s.animation.current) === null || _a === void 0 ? void 0 : _a.plan.anims.has(cur.orig))
            s.animation.current = undefined;
        const origPiece = s.pieces.get(cur.orig);
        if (!origPiece || !util.samePiece(origPiece, cur.piece))
            cancel(s);
        else {
            if (!cur.started && util.distanceSq(cur.pos, cur.origPos) >= Math.pow(s.draggable.distance, 2))
                cur.started = true;
            if (cur.started) {
                if (typeof cur.element === 'function') {
                    const found = cur.element();
                    if (!found)
                        return;
                    found.cgDragging = true;
                    found.classList.add('dragging');
                    cur.element = found;
                }
                const bounds = s.dom.bounds();
                util.translateAbs(cur.element, [
                    cur.pos[0] - bounds.left - bounds.width / 16,
                    cur.pos[1] - bounds.top - bounds.height / 16,
                ]);
            }
        }
        processDrag(s);
    });
}
function move(s, e) {
    if (s.draggable.current && (!e.touches || e.touches.length < 2)) {
        s.draggable.current.pos = util.eventPosition(e);
    }
}
exports.move = move;
function end(s, e) {
    const cur = s.draggable.current;
    if (!cur)
        return;
    if (e.type === 'touchend' && e.cancelable !== false)
        e.preventDefault();
    if (e.type === 'touchend' && cur.originTarget !== e.target && !cur.newPiece) {
        s.draggable.current = undefined;
        return;
    }
    board.unsetPremove(s);
    board.unsetPredrop(s);
    const eventPos = util.eventPosition(e) || cur.pos;
    const dest = board.getKeyAtDomPos(eventPos, board.whitePov(s), s.dom.bounds());
    if (dest && cur.started && cur.orig !== dest) {
        if (cur.newPiece)
            board.dropNewPiece(s, cur.orig, dest, cur.force);
        else {
            s.stats.ctrlKey = e.ctrlKey;
            if (board.userMove(s, cur.orig, dest))
                s.stats.dragged = true;
        }
    }
    else if (cur.newPiece) {
        s.pieces.delete(cur.orig);
    }
    else if (s.draggable.deleteOnDropOff && !dest) {
        s.pieces.delete(cur.orig);
        board.callUserFunction(s.events.change);
    }
    if (cur.orig === cur.previouslySelected && (cur.orig === dest || !dest))
        board.unselect(s);
    else if (!s.selectable.enabled)
        board.unselect(s);
    removeDragElements(s);
    s.draggable.current = undefined;
    s.dom.redraw();
}
exports.end = end;
function cancel(s) {
    const cur = s.draggable.current;
    if (cur) {
        if (cur.newPiece)
            s.pieces.delete(cur.orig);
        s.draggable.current = undefined;
        board.unselect(s);
        removeDragElements(s);
        s.dom.redraw();
    }
}
exports.cancel = cancel;
function removeDragElements(s) {
    const e = s.dom.elements;
    if (e.ghost)
        util.setVisible(e.ghost, false);
}
function pieceElementByKey(s, key) {
    let el = s.dom.elements.board.firstChild;
    while (el) {
        if (el.cgKey === key && el.tagName === 'PIECE')
            return el;
        el = el.nextSibling;
    }
    return;
}

},{"./anim":1,"./board":3,"./draw":7,"./util":17}],7:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clear = exports.cancel = exports.end = exports.move = exports.processDraw = exports.start = void 0;
const board_1 = require("./board");
const util_1 = require("./util");
const brushes = ['green', 'red', 'blue', 'yellow'];
function start(state, e) {
    if (e.touches && e.touches.length > 1)
        return;
    e.stopPropagation();
    e.preventDefault();
    e.ctrlKey ? board_1.unselect(state) : board_1.cancelMove(state);
    const pos = util_1.eventPosition(e), orig = board_1.getKeyAtDomPos(pos, board_1.whitePov(state), state.dom.bounds());
    if (!orig)
        return;
    state.drawable.current = {
        orig,
        pos,
        brush: eventBrush(e),
        snapToValidMove: state.drawable.defaultSnapToValidMove,
    };
    processDraw(state);
}
exports.start = start;
function processDraw(state) {
    requestAnimationFrame(() => {
        const cur = state.drawable.current;
        if (cur) {
            const keyAtDomPos = board_1.getKeyAtDomPos(cur.pos, board_1.whitePov(state), state.dom.bounds());
            if (!keyAtDomPos) {
                cur.snapToValidMove = false;
            }
            const mouseSq = cur.snapToValidMove
                ? board_1.getSnappedKeyAtDomPos(cur.orig, cur.pos, board_1.whitePov(state), state.dom.bounds())
                : keyAtDomPos;
            if (mouseSq !== cur.mouseSq) {
                cur.mouseSq = mouseSq;
                cur.dest = mouseSq !== cur.orig ? mouseSq : undefined;
                state.dom.redrawNow();
            }
            processDraw(state);
        }
    });
}
exports.processDraw = processDraw;
function move(state, e) {
    if (state.drawable.current)
        state.drawable.current.pos = util_1.eventPosition(e);
}
exports.move = move;
function end(state) {
    const cur = state.drawable.current;
    if (cur) {
        if (cur.mouseSq)
            addShape(state.drawable, cur);
        cancel(state);
    }
}
exports.end = end;
function cancel(state) {
    if (state.drawable.current) {
        state.drawable.current = undefined;
        state.dom.redraw();
    }
}
exports.cancel = cancel;
function clear(state) {
    if (state.drawable.shapes.length) {
        state.drawable.shapes = [];
        state.dom.redraw();
        onChange(state.drawable);
    }
}
exports.clear = clear;
function eventBrush(e) {
    var _a;
    const modA = (e.shiftKey || e.ctrlKey) && util_1.isRightButton(e);
    const modB = e.altKey || e.metaKey || ((_a = e.getModifierState) === null || _a === void 0 ? void 0 : _a.call(e, 'AltGraph'));
    return brushes[(modA ? 1 : 0) + (modB ? 2 : 0)];
}
function addShape(drawable, cur) {
    const sameShape = (s) => s.orig === cur.orig && s.dest === cur.dest;
    const similar = drawable.shapes.find(sameShape);
    if (similar)
        drawable.shapes = drawable.shapes.filter(s => !sameShape(s));
    if (!similar || similar.brush !== cur.brush)
        drawable.shapes.push(cur);
    onChange(drawable);
}
function onChange(drawable) {
    if (drawable.onChange)
        drawable.onChange(drawable.shapes);
}

},{"./board":3,"./util":17}],8:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drop = exports.cancelDropMode = exports.setDropMode = void 0;
const board = require("./board");
const util = require("./util");
const drag_1 = require("./drag");
function setDropMode(s, piece) {
    s.dropmode = {
        active: true,
        piece,
    };
    drag_1.cancel(s);
}
exports.setDropMode = setDropMode;
function cancelDropMode(s) {
    s.dropmode = {
        active: false,
    };
}
exports.cancelDropMode = cancelDropMode;
function drop(s, e) {
    if (!s.dropmode.active)
        return;
    board.unsetPremove(s);
    board.unsetPredrop(s);
    const piece = s.dropmode.piece;
    if (piece) {
        s.pieces.set('a0', piece);
        const position = util.eventPosition(e);
        const dest = position && board.getKeyAtDomPos(position, board.whitePov(s), s.dom.bounds());
        if (dest)
            board.dropNewPiece(s, 'a0', dest);
    }
    s.dom.redraw();
}
exports.drop = drop;

},{"./board":3,"./drag":6,"./util":17}],9:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bindDocument = exports.bindBoard = void 0;
const drag = require("./drag");
const draw = require("./draw");
const drop_1 = require("./drop");
const util_1 = require("./util");
function bindBoard(s, boundsUpdated) {
    const boardEl = s.dom.elements.board;
    if (!s.dom.relative && s.resizable && 'ResizeObserver' in window) {
        const observer = new window['ResizeObserver'](boundsUpdated);
        observer.observe(boardEl);
    }
    if (s.viewOnly)
        return;
    const onStart = startDragOrDraw(s);
    boardEl.addEventListener('touchstart', onStart, {
        passive: false,
    });
    boardEl.addEventListener('mousedown', onStart, {
        passive: false,
    });
    if (s.disableContextMenu || s.drawable.enabled) {
        boardEl.addEventListener('contextmenu', e => e.preventDefault());
    }
}
exports.bindBoard = bindBoard;
function bindDocument(s, boundsUpdated) {
    const unbinds = [];
    if (!s.dom.relative && s.resizable && !('ResizeObserver' in window)) {
        unbinds.push(unbindable(document.body, 'chessground.resize', boundsUpdated));
    }
    if (!s.viewOnly) {
        const onmove = dragOrDraw(s, drag.move, draw.move);
        const onend = dragOrDraw(s, drag.end, draw.end);
        for (const ev of ['touchmove', 'mousemove'])
            unbinds.push(unbindable(document, ev, onmove));
        for (const ev of ['touchend', 'mouseup'])
            unbinds.push(unbindable(document, ev, onend));
        const onScroll = () => s.dom.bounds.clear();
        unbinds.push(unbindable(document, 'scroll', onScroll, { capture: true, passive: true }));
        unbinds.push(unbindable(window, 'resize', onScroll, { passive: true }));
    }
    return () => unbinds.forEach(f => f());
}
exports.bindDocument = bindDocument;
function unbindable(el, eventName, callback, options) {
    el.addEventListener(eventName, callback, options);
    return () => el.removeEventListener(eventName, callback, options);
}
function startDragOrDraw(s) {
    return e => {
        if (s.draggable.current)
            drag.cancel(s);
        else if (s.drawable.current)
            draw.cancel(s);
        else if (e.shiftKey || util_1.isRightButton(e)) {
            if (s.drawable.enabled)
                draw.start(s, e);
        }
        else if (!s.viewOnly) {
            if (s.dropmode.active)
                drop_1.drop(s, e);
            else
                drag.start(s, e);
        }
    };
}
function dragOrDraw(s, withDrag, withDraw) {
    return e => {
        if (s.drawable.current) {
            if (s.drawable.enabled)
                withDraw(s, e);
        }
        else if (!s.viewOnly)
            withDrag(s, e);
    };
}

},{"./drag":6,"./draw":7,"./drop":8,"./util":17}],10:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.explosion = void 0;
function explosion(state, keys) {
    state.exploding = { stage: 1, keys };
    state.dom.redraw();
    setTimeout(() => {
        setStage(state, 2);
        setTimeout(() => setStage(state, undefined), 120);
    }, 120);
}
exports.explosion = explosion;
function setStage(state, stage) {
    if (state.exploding) {
        if (stage)
            state.exploding.stage = stage;
        else
            state.exploding = undefined;
        state.dom.redraw();
    }
}

},{}],11:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.write = exports.read = exports.initial = void 0;
const util_1 = require("./util");
const cg = require("./types");
exports.initial = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const roles = {
    p: 'pawn',
    r: 'rook',
    n: 'knight',
    b: 'bishop',
    q: 'queen',
    k: 'king',
};
const letters = {
    pawn: 'p',
    rook: 'r',
    knight: 'n',
    bishop: 'b',
    queen: 'q',
    king: 'k',
};
function read(fen) {
    if (fen === 'start')
        fen = exports.initial;
    const pieces = new Map();
    let row = 7, col = 0;
    for (const c of fen) {
        switch (c) {
            case ' ':
                return pieces;
            case '/':
                --row;
                if (row < 0)
                    return pieces;
                col = 0;
                break;
            case '~':
                const piece = pieces.get(util_1.pos2key([col, row]));
                if (piece)
                    piece.promoted = true;
                break;
            default:
                const nb = c.charCodeAt(0);
                if (nb < 57)
                    col += nb - 48;
                else {
                    const role = c.toLowerCase();
                    pieces.set(util_1.pos2key([col, row]), {
                        role: roles[role],
                        color: c === role ? 'black' : 'white',
                    });
                    ++col;
                }
        }
    }
    return pieces;
}
exports.read = read;
function write(pieces) {
    return util_1.invRanks
        .map(y => cg.files
        .map(x => {
        const piece = pieces.get((x + y));
        if (piece) {
            const letter = letters[piece.role];
            return piece.color === 'white' ? letter.toUpperCase() : letter;
        }
        else
            return '1';
    })
        .join(''))
        .join('/')
        .replace(/1{2,}/g, s => s.length.toString());
}
exports.write = write;

},{"./types":16,"./util":17}],12:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.premove = exports.queen = exports.knight = void 0;
const util = require("./util");
function diff(a, b) {
    return Math.abs(a - b);
}
function pawn(color) {
    return (x1, y1, x2, y2) => diff(x1, x2) < 2 &&
        (color === 'white'
            ?
                y2 === y1 + 1 || (y1 <= 1 && y2 === y1 + 2 && x1 === x2)
            : y2 === y1 - 1 || (y1 >= 6 && y2 === y1 - 2 && x1 === x2));
}
const knight = (x1, y1, x2, y2) => {
    const xd = diff(x1, x2);
    const yd = diff(y1, y2);
    return (xd === 1 && yd === 2) || (xd === 2 && yd === 1);
};
exports.knight = knight;
const bishop = (x1, y1, x2, y2) => {
    return diff(x1, x2) === diff(y1, y2);
};
const rook = (x1, y1, x2, y2) => {
    return x1 === x2 || y1 === y2;
};
const queen = (x1, y1, x2, y2) => {
    return bishop(x1, y1, x2, y2) || rook(x1, y1, x2, y2);
};
exports.queen = queen;
function king(color, rookFiles, canCastle) {
    return (x1, y1, x2, y2) => (diff(x1, x2) < 2 && diff(y1, y2) < 2) ||
        (canCastle &&
            y1 === y2 &&
            y1 === (color === 'white' ? 0 : 7) &&
            ((x1 === 4 && ((x2 === 2 && rookFiles.includes(0)) || (x2 === 6 && rookFiles.includes(7)))) ||
                rookFiles.includes(x2)));
}
function rookFilesOf(pieces, color) {
    const backrank = color === 'white' ? '1' : '8';
    const files = [];
    for (const [key, piece] of pieces) {
        if (key[1] === backrank && piece.color === color && piece.role === 'rook') {
            files.push(util.key2pos(key)[0]);
        }
    }
    return files;
}
function premove(pieces, key, canCastle) {
    const piece = pieces.get(key);
    if (!piece)
        return [];
    const pos = util.key2pos(key), r = piece.role, mobility = r === 'pawn'
        ? pawn(piece.color)
        : r === 'knight'
            ? exports.knight
            : r === 'bishop'
                ? bishop
                : r === 'rook'
                    ? rook
                    : r === 'queen'
                        ? exports.queen
                        : king(piece.color, rookFilesOf(pieces, piece.color), canCastle);
    return util.allPos
        .filter(pos2 => (pos[0] !== pos2[0] || pos[1] !== pos2[1]) && mobility(pos[0], pos[1], pos2[0], pos2[1]))
        .map(util.pos2key);
}
exports.premove = premove;

},{"./util":17}],13:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBounds = exports.render = void 0;
const util_1 = require("./util");
const board_1 = require("./board");
const util = require("./util");
function render(s) {
    const asWhite = board_1.whitePov(s), posToTranslate = s.dom.relative ? util.posToTranslateRel : util.posToTranslateAbs(s.dom.bounds()), translate = s.dom.relative ? util.translateRel : util.translateAbs, boardEl = s.dom.elements.board, pieces = s.pieces, curAnim = s.animation.current, anims = curAnim ? curAnim.plan.anims : new Map(), fadings = curAnim ? curAnim.plan.fadings : new Map(), curDrag = s.draggable.current, squares = computeSquareClasses(s), samePieces = new Set(), sameSquares = new Set(), movedPieces = new Map(), movedSquares = new Map();
    let k, el, pieceAtKey, elPieceName, anim, fading, pMvdset, pMvd, sMvdset, sMvd;
    el = boardEl.firstChild;
    while (el) {
        k = el.cgKey;
        if (isPieceNode(el)) {
            pieceAtKey = pieces.get(k);
            anim = anims.get(k);
            fading = fadings.get(k);
            elPieceName = el.cgPiece;
            if (el.cgDragging && (!curDrag || curDrag.orig !== k)) {
                el.classList.remove('dragging');
                translate(el, posToTranslate(util_1.key2pos(k), asWhite));
                el.cgDragging = false;
            }
            if (!fading && el.cgFading) {
                el.cgFading = false;
                el.classList.remove('fading');
            }
            if (pieceAtKey) {
                if (anim && el.cgAnimating && elPieceName === pieceNameOf(pieceAtKey)) {
                    const pos = util_1.key2pos(k);
                    pos[0] += anim[2];
                    pos[1] += anim[3];
                    el.classList.add('anim');
                    translate(el, posToTranslate(pos, asWhite));
                }
                else if (el.cgAnimating) {
                    el.cgAnimating = false;
                    el.classList.remove('anim');
                    translate(el, posToTranslate(util_1.key2pos(k), asWhite));
                    if (s.addPieceZIndex)
                        el.style.zIndex = posZIndex(util_1.key2pos(k), asWhite);
                }
                if (elPieceName === pieceNameOf(pieceAtKey) && (!fading || !el.cgFading)) {
                    samePieces.add(k);
                }
                else {
                    if (fading && elPieceName === pieceNameOf(fading)) {
                        el.classList.add('fading');
                        el.cgFading = true;
                    }
                    else {
                        appendValue(movedPieces, elPieceName, el);
                    }
                }
            }
            else {
                appendValue(movedPieces, elPieceName, el);
            }
        }
        else if (isSquareNode(el)) {
            const cn = el.className;
            if (squares.get(k) === cn)
                sameSquares.add(k);
            else
                appendValue(movedSquares, cn, el);
        }
        el = el.nextSibling;
    }
    for (const [sk, className] of squares) {
        if (!sameSquares.has(sk)) {
            sMvdset = movedSquares.get(className);
            sMvd = sMvdset && sMvdset.pop();
            const translation = posToTranslate(util_1.key2pos(sk), asWhite);
            if (sMvd) {
                sMvd.cgKey = sk;
                translate(sMvd, translation);
            }
            else {
                const squareNode = util_1.createEl('square', className);
                squareNode.cgKey = sk;
                translate(squareNode, translation);
                boardEl.insertBefore(squareNode, boardEl.firstChild);
            }
        }
    }
    for (const [k, p] of pieces) {
        anim = anims.get(k);
        if (!samePieces.has(k)) {
            pMvdset = movedPieces.get(pieceNameOf(p));
            pMvd = pMvdset && pMvdset.pop();
            if (pMvd) {
                pMvd.cgKey = k;
                if (pMvd.cgFading) {
                    pMvd.classList.remove('fading');
                    pMvd.cgFading = false;
                }
                const pos = util_1.key2pos(k);
                if (s.addPieceZIndex)
                    pMvd.style.zIndex = posZIndex(pos, asWhite);
                if (anim) {
                    pMvd.cgAnimating = true;
                    pMvd.classList.add('anim');
                    pos[0] += anim[2];
                    pos[1] += anim[3];
                }
                translate(pMvd, posToTranslate(pos, asWhite));
            }
            else {
                const pieceName = pieceNameOf(p), pieceNode = util_1.createEl('piece', pieceName), pos = util_1.key2pos(k);
                pieceNode.cgPiece = pieceName;
                pieceNode.cgKey = k;
                if (anim) {
                    pieceNode.cgAnimating = true;
                    pos[0] += anim[2];
                    pos[1] += anim[3];
                }
                translate(pieceNode, posToTranslate(pos, asWhite));
                if (s.addPieceZIndex)
                    pieceNode.style.zIndex = posZIndex(pos, asWhite);
                boardEl.appendChild(pieceNode);
            }
        }
    }
    for (const nodes of movedPieces.values())
        removeNodes(s, nodes);
    for (const nodes of movedSquares.values())
        removeNodes(s, nodes);
}
exports.render = render;
function updateBounds(s) {
    if (s.dom.relative)
        return;
    const asWhite = board_1.whitePov(s), posToTranslate = util.posToTranslateAbs(s.dom.bounds());
    let el = s.dom.elements.board.firstChild;
    while (el) {
        if ((isPieceNode(el) && !el.cgAnimating) || isSquareNode(el)) {
            util.translateAbs(el, posToTranslate(util_1.key2pos(el.cgKey), asWhite));
        }
        el = el.nextSibling;
    }
}
exports.updateBounds = updateBounds;
function isPieceNode(el) {
    return el.tagName === 'PIECE';
}
function isSquareNode(el) {
    return el.tagName === 'SQUARE';
}
function removeNodes(s, nodes) {
    for (const node of nodes)
        s.dom.elements.board.removeChild(node);
}
function posZIndex(pos, asWhite) {
    let z = 2 + pos[1] * 8 + (7 - pos[0]);
    if (asWhite)
        z = 67 - z;
    return z + '';
}
function pieceNameOf(piece) {
    return `${piece.color} ${piece.role}`;
}
function computeSquareClasses(s) {
    var _a;
    const squares = new Map();
    if (s.lastMove && s.highlight.lastMove)
        for (const k of s.lastMove) {
            addSquare(squares, k, 'last-move');
        }
    if (s.check && s.highlight.check)
        addSquare(squares, s.check, 'check');
    if (s.selected) {
        addSquare(squares, s.selected, 'selected');
        if (s.movable.showDests) {
            const dests = (_a = s.movable.dests) === null || _a === void 0 ? void 0 : _a.get(s.selected);
            if (dests)
                for (const k of dests) {
                    addSquare(squares, k, 'move-dest' + (s.pieces.has(k) ? ' oc' : ''));
                }
            const pDests = s.premovable.dests;
            if (pDests)
                for (const k of pDests) {
                    addSquare(squares, k, 'premove-dest' + (s.pieces.has(k) ? ' oc' : ''));
                }
        }
    }
    const premove = s.premovable.current;
    if (premove)
        for (const k of premove)
            addSquare(squares, k, 'current-premove');
    else if (s.predroppable.current)
        addSquare(squares, s.predroppable.current.key, 'current-premove');
    const o = s.exploding;
    if (o)
        for (const k of o.keys)
            addSquare(squares, k, 'exploding' + o.stage);
    return squares;
}
function addSquare(squares, key, klass) {
    const classes = squares.get(key);
    if (classes)
        squares.set(key, `${classes} ${klass}`);
    else
        squares.set(key, klass);
}
function appendValue(map, key, value) {
    const arr = map.get(key);
    if (arr)
        arr.push(value);
    else
        map.set(key, [value]);
}

},{"./board":3,"./util":17}],14:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaults = void 0;
const fen = require("./fen");
const util_1 = require("./util");
function defaults() {
    return {
        pieces: fen.read(fen.initial),
        orientation: 'white',
        turnColor: 'white',
        coordinates: true,
        autoCastle: true,
        viewOnly: false,
        disableContextMenu: false,
        resizable: true,
        addPieceZIndex: false,
        pieceKey: false,
        highlight: {
            lastMove: true,
            check: true,
        },
        animation: {
            enabled: true,
            duration: 200,
        },
        movable: {
            free: true,
            color: 'both',
            showDests: true,
            events: {},
            rookCastle: true,
        },
        premovable: {
            enabled: true,
            showDests: true,
            castle: true,
            events: {},
        },
        predroppable: {
            enabled: false,
            events: {},
        },
        draggable: {
            enabled: true,
            distance: 3,
            autoDistance: true,
            showGhost: true,
            deleteOnDropOff: false,
        },
        dropmode: {
            active: false,
        },
        selectable: {
            enabled: true,
        },
        stats: {
            dragged: !('ontouchstart' in window),
        },
        events: {},
        drawable: {
            enabled: true,
            visible: true,
            defaultSnapToValidMove: true,
            eraseOnClick: true,
            shapes: [],
            autoShapes: [],
            brushes: {
                green: { key: 'g', color: '#15781B', opacity: 1, lineWidth: 10 },
                red: { key: 'r', color: '#882020', opacity: 1, lineWidth: 10 },
                blue: { key: 'b', color: '#003088', opacity: 1, lineWidth: 10 },
                yellow: { key: 'y', color: '#e68f00', opacity: 1, lineWidth: 10 },
                paleBlue: { key: 'pb', color: '#003088', opacity: 0.4, lineWidth: 15 },
                paleGreen: { key: 'pg', color: '#15781B', opacity: 0.4, lineWidth: 15 },
                paleRed: { key: 'pr', color: '#882020', opacity: 0.4, lineWidth: 15 },
                paleGrey: {
                    key: 'pgr',
                    color: '#4a4a4a',
                    opacity: 0.35,
                    lineWidth: 15,
                },
            },
            pieces: {
                baseUrl: 'https://lichess1.org/assets/piece/cburnett/',
            },
            prevSvgHash: '',
        },
        hold: util_1.timer(),
    };
}
exports.defaults = defaults;

},{"./fen":11,"./util":17}],15:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setAttributes = exports.renderSvg = exports.createElement = void 0;
const util_1 = require("./util");
function createElement(tagName) {
    return document.createElementNS('http://www.w3.org/2000/svg', tagName);
}
exports.createElement = createElement;
function renderSvg(state, svg, customSvg) {
    const d = state.drawable, curD = d.current, cur = curD && curD.mouseSq ? curD : undefined, arrowDests = new Map(), bounds = state.dom.bounds();
    for (const s of d.shapes.concat(d.autoShapes).concat(cur ? [cur] : [])) {
        if (s.dest)
            arrowDests.set(s.dest, (arrowDests.get(s.dest) || 0) + 1);
    }
    const shapes = d.shapes.concat(d.autoShapes).map((s) => {
        return {
            shape: s,
            current: false,
            hash: shapeHash(s, arrowDests, false, bounds),
        };
    });
    if (cur)
        shapes.push({
            shape: cur,
            current: true,
            hash: shapeHash(cur, arrowDests, true, bounds),
        });
    const fullHash = shapes.map(sc => sc.hash).join(';');
    if (fullHash === state.drawable.prevSvgHash)
        return;
    state.drawable.prevSvgHash = fullHash;
    const defsEl = svg.querySelector('defs');
    const shapesEl = svg.querySelector('g');
    const customSvgsEl = customSvg.querySelector('g');
    syncDefs(d, shapes, defsEl);
    syncShapes(state, shapes.filter(s => !s.shape.customSvg), d.brushes, arrowDests, shapesEl);
    syncShapes(state, shapes.filter(s => s.shape.customSvg), d.brushes, arrowDests, customSvgsEl);
}
exports.renderSvg = renderSvg;
function syncDefs(d, shapes, defsEl) {
    const brushes = new Map();
    let brush;
    for (const s of shapes) {
        if (s.shape.dest) {
            brush = d.brushes[s.shape.brush];
            if (s.shape.modifiers)
                brush = makeCustomBrush(brush, s.shape.modifiers);
            brushes.set(brush.key, brush);
        }
    }
    const keysInDom = new Set();
    let el = defsEl.firstChild;
    while (el) {
        keysInDom.add(el.getAttribute('cgKey'));
        el = el.nextSibling;
    }
    for (const [key, brush] of brushes.entries()) {
        if (!keysInDom.has(key))
            defsEl.appendChild(renderMarker(brush));
    }
}
function syncShapes(state, shapes, brushes, arrowDests, root) {
    const bounds = state.dom.bounds(), hashesInDom = new Map(), toRemove = [];
    for (const sc of shapes)
        hashesInDom.set(sc.hash, false);
    let el = root.firstChild, elHash;
    while (el) {
        elHash = el.getAttribute('cgHash');
        if (hashesInDom.has(elHash))
            hashesInDom.set(elHash, true);
        else
            toRemove.push(el);
        el = el.nextSibling;
    }
    for (const el of toRemove)
        root.removeChild(el);
    for (const sc of shapes) {
        if (!hashesInDom.get(sc.hash))
            root.appendChild(renderShape(state, sc, brushes, arrowDests, bounds));
    }
}
function shapeHash({ orig, dest, brush, piece, modifiers, customSvg }, arrowDests, current, bounds) {
    return [
        bounds.width,
        bounds.height,
        current,
        orig,
        dest,
        brush,
        dest && (arrowDests.get(dest) || 0) > 1,
        piece && pieceHash(piece),
        modifiers && modifiersHash(modifiers),
        customSvg && customSvgHash(customSvg),
    ]
        .filter(x => x)
        .join(',');
}
function pieceHash(piece) {
    return [piece.color, piece.role, piece.scale].filter(x => x).join(',');
}
function modifiersHash(m) {
    return '' + (m.lineWidth || '');
}
function customSvgHash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (((h << 5) - h) + s.charCodeAt(i)) >>> 0;
    }
    return 'custom-' + h.toString();
}
function renderShape(state, { shape, current, hash }, brushes, arrowDests, bounds) {
    let el;
    if (shape.customSvg) {
        const orig = orient(util_1.key2pos(shape.orig), state.orientation);
        el = renderCustomSvg(shape.customSvg, orig, bounds);
    }
    else if (shape.piece)
        el = renderPiece(state.drawable.pieces.baseUrl, orient(util_1.key2pos(shape.orig), state.orientation), shape.piece, bounds);
    else {
        const orig = orient(util_1.key2pos(shape.orig), state.orientation);
        if (shape.dest) {
            let brush = brushes[shape.brush];
            if (shape.modifiers)
                brush = makeCustomBrush(brush, shape.modifiers);
            el = renderArrow(brush, orig, orient(util_1.key2pos(shape.dest), state.orientation), current, (arrowDests.get(shape.dest) || 0) > 1, bounds);
        }
        else
            el = renderCircle(brushes[shape.brush], orig, current, bounds);
    }
    el.setAttribute('cgHash', hash);
    return el;
}
function renderCustomSvg(customSvg, pos, bounds) {
    const { width, height } = bounds;
    const w = width / 8;
    const h = height / 8;
    const x = pos[0] * w;
    const y = (7 - pos[1]) * h;
    const g = setAttributes(createElement('g'), { transform: `translate(${x},${y})` });
    const svg = setAttributes(createElement('svg'), { width: w, height: h, viewBox: '0 0 100 100' });
    g.appendChild(svg);
    svg.innerHTML = customSvg;
    return g;
}
function renderCircle(brush, pos, current, bounds) {
    const o = pos2px(pos, bounds), widths = circleWidth(bounds), radius = (bounds.width + bounds.height) / 32;
    return setAttributes(createElement('circle'), {
        stroke: brush.color,
        'stroke-width': widths[current ? 0 : 1],
        fill: 'none',
        opacity: opacity(brush, current),
        cx: o[0],
        cy: o[1],
        r: radius - widths[1] / 2,
    });
}
function renderArrow(brush, orig, dest, current, shorten, bounds) {
    const m = arrowMargin(bounds, shorten && !current), a = pos2px(orig, bounds), b = pos2px(dest, bounds), dx = b[0] - a[0], dy = b[1] - a[1], angle = Math.atan2(dy, dx), xo = Math.cos(angle) * m, yo = Math.sin(angle) * m;
    return setAttributes(createElement('line'), {
        stroke: brush.color,
        'stroke-width': lineWidth(brush, current, bounds),
        'stroke-linecap': 'round',
        'marker-end': 'url(#arrowhead-' + brush.key + ')',
        opacity: opacity(brush, current),
        x1: a[0],
        y1: a[1],
        x2: b[0] - xo,
        y2: b[1] - yo,
    });
}
function renderPiece(baseUrl, pos, piece, bounds) {
    const o = pos2px(pos, bounds), size = (bounds.width / 8) * (piece.scale || 1), name = piece.color[0] + (piece.role === 'knight' ? 'n' : piece.role[0]).toUpperCase();
    return setAttributes(createElement('image'), {
        className: `${piece.role} ${piece.color}`,
        x: o[0] - size / 2,
        y: o[1] - size / 2,
        width: size,
        height: size,
        href: baseUrl + name + '.svg',
    });
}
function renderMarker(brush) {
    const marker = setAttributes(createElement('marker'), {
        id: 'arrowhead-' + brush.key,
        orient: 'auto',
        markerWidth: 4,
        markerHeight: 8,
        refX: 2.05,
        refY: 2.01,
    });
    marker.appendChild(setAttributes(createElement('path'), {
        d: 'M0,0 V4 L3,2 Z',
        fill: brush.color,
    }));
    marker.setAttribute('cgKey', brush.key);
    return marker;
}
function setAttributes(el, attrs) {
    for (const key in attrs)
        el.setAttribute(key, attrs[key]);
    return el;
}
exports.setAttributes = setAttributes;
function orient(pos, color) {
    return color === 'white' ? pos : [7 - pos[0], 7 - pos[1]];
}
function makeCustomBrush(base, modifiers) {
    return {
        color: base.color,
        opacity: Math.round(base.opacity * 10) / 10,
        lineWidth: Math.round(modifiers.lineWidth || base.lineWidth),
        key: [base.key, modifiers.lineWidth].filter(x => x).join(''),
    };
}
function circleWidth(bounds) {
    const base = bounds.width / 512;
    return [3 * base, 4 * base];
}
function lineWidth(brush, current, bounds) {
    return (((brush.lineWidth || 10) * (current ? 0.85 : 1)) / 512) * bounds.width;
}
function opacity(brush, current) {
    return (brush.opacity || 1) * (current ? 0.9 : 1);
}
function arrowMargin(bounds, shorten) {
    return ((shorten ? 20 : 10) / 512) * bounds.width;
}
function pos2px(pos, bounds) {
    return [((pos[0] + 0.5) * bounds.width) / 8, ((7.5 - pos[1]) * bounds.height) / 8];
}

},{"./util":17}],16:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ranks = exports.files = exports.colors = void 0;
exports.colors = ['white', 'black'];
exports.files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
exports.ranks = ['1', '2', '3', '4', '5', '6', '7', '8'];

},{}],17:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeSquareCenter = exports.createEl = exports.isRightButton = exports.eventPosition = exports.setVisible = exports.translateRel = exports.translateAbs = exports.posToTranslateRel = exports.posToTranslateAbs = exports.samePiece = exports.distanceSq = exports.opposite = exports.timer = exports.memo = exports.allPos = exports.key2pos = exports.pos2key = exports.allKeys = exports.invRanks = void 0;
const cg = require("./types");
exports.invRanks = [...cg.ranks].reverse();
exports.allKeys = Array.prototype.concat(...cg.files.map(c => cg.ranks.map(r => c + r)));
const pos2key = (pos) => exports.allKeys[8 * pos[0] + pos[1]];
exports.pos2key = pos2key;
const key2pos = (k) => [k.charCodeAt(0) - 97, k.charCodeAt(1) - 49];
exports.key2pos = key2pos;
exports.allPos = exports.allKeys.map(exports.key2pos);
function memo(f) {
    let v;
    const ret = () => {
        if (v === undefined)
            v = f();
        return v;
    };
    ret.clear = () => {
        v = undefined;
    };
    return ret;
}
exports.memo = memo;
const timer = () => {
    let startAt;
    return {
        start() {
            startAt = performance.now();
        },
        cancel() {
            startAt = undefined;
        },
        stop() {
            if (!startAt)
                return 0;
            const time = performance.now() - startAt;
            startAt = undefined;
            return time;
        },
    };
};
exports.timer = timer;
const opposite = (c) => (c === 'white' ? 'black' : 'white');
exports.opposite = opposite;
const distanceSq = (pos1, pos2) => {
    const dx = pos1[0] - pos2[0], dy = pos1[1] - pos2[1];
    return dx * dx + dy * dy;
};
exports.distanceSq = distanceSq;
const samePiece = (p1, p2) => p1.role === p2.role && p1.color === p2.color;
exports.samePiece = samePiece;
const posToTranslateBase = (pos, asWhite, xFactor, yFactor) => [
    (asWhite ? pos[0] : 7 - pos[0]) * xFactor,
    (asWhite ? 7 - pos[1] : pos[1]) * yFactor,
];
const posToTranslateAbs = (bounds) => {
    const xFactor = bounds.width / 8, yFactor = bounds.height / 8;
    return (pos, asWhite) => posToTranslateBase(pos, asWhite, xFactor, yFactor);
};
exports.posToTranslateAbs = posToTranslateAbs;
const posToTranslateRel = (pos, asWhite) => posToTranslateBase(pos, asWhite, 100, 100);
exports.posToTranslateRel = posToTranslateRel;
const translateAbs = (el, pos) => {
    el.style.transform = `translate(${pos[0]}px,${pos[1]}px)`;
};
exports.translateAbs = translateAbs;
const translateRel = (el, percents) => {
    el.style.transform = `translate(${percents[0]}%,${percents[1]}%)`;
};
exports.translateRel = translateRel;
const setVisible = (el, v) => {
    el.style.visibility = v ? 'visible' : 'hidden';
};
exports.setVisible = setVisible;
const eventPosition = (e) => {
    var _a;
    if (e.clientX || e.clientX === 0)
        return [e.clientX, e.clientY];
    if ((_a = e.targetTouches) === null || _a === void 0 ? void 0 : _a[0])
        return [e.targetTouches[0].clientX, e.targetTouches[0].clientY];
    return;
};
exports.eventPosition = eventPosition;
const isRightButton = (e) => e.buttons === 2 || e.button === 2;
exports.isRightButton = isRightButton;
const createEl = (tagName, className) => {
    const el = document.createElement(tagName);
    if (className)
        el.className = className;
    return el;
};
exports.createEl = createEl;
function computeSquareCenter(key, asWhite, bounds) {
    const pos = exports.key2pos(key);
    if (!asWhite) {
        pos[0] = 7 - pos[0];
        pos[1] = 7 - pos[1];
    }
    return [
        bounds.left + (bounds.width * pos[0]) / 8 + bounds.width / 16,
        bounds.top + (bounds.height * (7 - pos[1])) / 8 + bounds.height / 16,
    ];
}
exports.computeSquareCenter = computeSquareCenter;

},{"./types":16}],18:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderWrap = void 0;
const util_1 = require("./util");
const types_1 = require("./types");
const svg_1 = require("./svg");
function renderWrap(element, s, relative) {
    element.innerHTML = '';
    element.classList.add('cg-wrap');
    for (const c of types_1.colors)
        element.classList.toggle('orientation-' + c, s.orientation === c);
    element.classList.toggle('manipulable', !s.viewOnly);
    const helper = util_1.createEl('cg-helper');
    element.appendChild(helper);
    const container = util_1.createEl('cg-container');
    helper.appendChild(container);
    const board = util_1.createEl('cg-board');
    container.appendChild(board);
    let svg;
    let customSvg;
    if (s.drawable.visible && !relative) {
        svg = svg_1.setAttributes(svg_1.createElement('svg'), { 'class': 'cg-shapes' });
        svg.appendChild(svg_1.createElement('defs'));
        svg.appendChild(svg_1.createElement('g'));
        customSvg = svg_1.setAttributes(svg_1.createElement('svg'), { 'class': 'cg-custom-svgs' });
        customSvg.appendChild(svg_1.createElement('g'));
        container.appendChild(svg);
        container.appendChild(customSvg);
    }
    if (s.coordinates) {
        const orientClass = s.orientation === 'black' ? ' black' : '';
        container.appendChild(renderCoords(types_1.ranks, 'ranks' + orientClass));
        container.appendChild(renderCoords(types_1.files, 'files' + orientClass));
    }
    let ghost;
    if (s.draggable.showGhost && !relative) {
        ghost = util_1.createEl('piece', 'ghost');
        util_1.setVisible(ghost, false);
        container.appendChild(ghost);
    }
    return {
        board,
        container,
        ghost,
        svg,
        customSvg,
    };
}
exports.renderWrap = renderWrap;
function renderCoords(elems, className) {
    const el = util_1.createEl('coords', className);
    let f;
    for (const elem of elems) {
        f = util_1.createEl('coord');
        f.textContent = elem;
        el.appendChild(f);
    }
    return el;
}

},{"./svg":15,"./types":16,"./util":17}],19:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiPlay = void 0;
const board_1 = require("chessground/board");
const util_1 = require("chessground/util");
const trailchess_1 = require("./trailchess");
function roleValue(role) {
    return {
        'pawn': 1,
        'knight': 3,
        'bishop': 3,
        'rook': 5,
        'queen': 9
    }[role];
}
function pickRandom(array) {
    return array[Math.floor(Math.random() * array.length)];
}
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
}
function computeMoveWeight(color, opponentAttacks, isPlaced, oldTrail, move) {
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
    }
    else if (!isPlaced && origAttacked && !destAttacked) {
        weight += roleValue(piece.role) * 10;
    }
    if (!destAttacked) {
        if (piece.role == 'pawn' && oldTrail.length > 3) {
            // Pawn move should have more weight as it approaches the edge.
            // The past trail length approximates it.
            weight += oldTrail.length + 1;
        }
        else {
            weight += move.trail.length / 2;
        }
    }
    if (move.cuts) {
        const weightSign = move.cuts.piece.color === color ? -1 : 1;
        if (move.cuts.isErased) {
            weight += weightSign * 10 * roleValue(move.cuts.piece.role);
        }
        else {
            weight += weightSign * 5;
        }
    }
    return weight;
}
function getAttackedSquares(state, attackerColor) {
    var _a;
    const attackedSquares = new Set();
    const mapAfterMove = state.stage.kind == 'MovePlacedPiece' ? state.stage.movesMapBackup : state.movesMap;
    if (!mapAfterMove)
        return attackedSquares;
    for (const [s, moves] of mapAfterMove) {
        if (((_a = state.cg.state.pieces.get(s)) === null || _a === void 0 ? void 0 : _a.color) !== attackerColor)
            continue;
        for (const move of moves) {
            attackedSquares.add(move.trail[move.trail.length - 1]);
        }
    }
    return attackedSquares;
}
function getWeightedMoves(state, random) {
    if (!state.movesMap || state.movesMap.size == 0)
        return [];
    if (random) {
        const moves = pickRandom([...state.movesMap.values()]);
        const move = pickRandom(moves);
        return [{ move, weight: 0 }];
    }
    const opponentAttacks = getAttackedSquares(state, util_1.opposite(state.color));
    const weightedMoves = [];
    for (const moves of state.movesMap.values()) {
        const { pieceId, piece } = moves[0];
        const trail = state.trails.get(pieceId);
        if (piece.color !== state.color)
            continue;
        for (const move of moves) {
            const weight = computeMoveWeight(state.color, opponentAttacks, false, trail, move);
            weightedMoves.push({ move, weight });
        }
    }
    return weightedMoves;
}
function sortWeights(arr) {
    return arr.sort((a, b) => b.weight - a.weight);
}
function bestTrailChoice(state) {
    const stage = state.stage;
    if (stage.kind !== 'ChooseTrail')
        throw new Error('ChooseTrail');
    const playerAttacks = getAttackedSquares(state, state.color);
    const opponentAttacks = getAttackedSquares(state, util_1.opposite(state.color));
    const isPlayerPiece = stage.piece.color === state.color;
    const weightedTrails = [];
    for (const trail of stage.trails) {
        let weight = 0;
        weight += (isPlayerPiece ? 1 : -1) * trail.length;
        const dest = trail[trail.length - 1];
        if (isPlayerPiece && opponentAttacks.has(dest)) {
            weight -= roleValue(stage.piece.role) * 10;
        }
        else if (!isPlayerPiece && playerAttacks.has(dest)) {
            weight += roleValue(stage.piece.role) * 10;
        }
        const tempPieceId = -1;
        const moves = withTempState(state, state => {
            state.cg.state.pieces.set(dest, stage.piece);
            state.pieceIds.set(dest, tempPieceId);
            trailchess_1.setPieceTrail(state, tempPieceId, trail);
            return trailchess_1.getMoves(state, dest, true, true);
        });
        if (moves.length) {
            let futureMoveWeight = moves
                .map(move => computeMoveWeight(state.color, isPlayerPiece ? opponentAttacks : playerAttacks, false, trail, move))
                .reduce((weight1, weight2) => Math.max(weight1, weight2)) / 2;
            weight += isPlayerPiece ? futureMoveWeight : -futureMoveWeight;
        }
        weightedTrails.push({ trail, weight });
    }
    return sortWeights(weightedTrails)[0].trail;
}
function makeMove(state, move) {
    state.cg.move(move.trail[0], move.trail[move.trail.length - 1]);
}
function randomWeighted(arr, top) {
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
        if (rand <= counter)
            return a;
    }
    throw new Error("randomWeighted");
}
function withTempState(state, func) {
    const tempState = Object.assign(Object.assign({}, state), { pieceIds: new Map(state.pieceIds), trailMap: new Map(state.trailMap), trails: new Map(state.trails) });
    const piecesBackup = state.cg.state.pieces;
    state.cg.state.pieces = new Map(state.cg.state.pieces);
    const result = func(tempState);
    state.cg.state.pieces = piecesBackup;
    return result;
}
function getWeightedPlacement(state, random) {
    const pieceBank = state.pieceBank.get(state.color);
    const freeSquares = [];
    for (const file of 'abcdefgh') {
        for (const rank of [1, 2, 3, 4, 5, 6, 7, 8]) {
            const key = `${file}${rank}`;
            if (!state.trailMap.has(key)) {
                freeSquares.push(key);
            }
        }
    }
    shuffleArray(freeSquares);
    const tempPieceId = -1;
    const availableRoles = [...pieceBank].filter(([_, count]) => count > 0).map(([role]) => role);
    if (availableRoles.length === 0)
        return [];
    const weightedPlacements = [];
    let attempts = 50;
    const opponentAttacks = getAttackedSquares(state, util_1.opposite(state.color));
    for (const key of freeSquares) {
        if (attempts-- == 0)
            break;
        const role = pickRandom(availableRoles);
        const piece = { role, color: state.color };
        const moves = withTempState(state, state => {
            state.cg.state.pieces.set(key, piece);
            state.pieceIds.set(key, tempPieceId);
            const oldTrail = [key];
            trailchess_1.setPieceTrail(state, tempPieceId, oldTrail);
            return trailchess_1.getMoves(state, key, false, false)
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
            weightedPlacements.push({ placeAt: key, piece, weight });
            if (random) {
                return weightedPlacements;
            }
        }
    }
    return weightedPlacements;
}
function aiPlay(state, random) {
    const stage = state.stage;
    trailchess_1.validateState(state);
    if (stage.kind == 'MoveOrPlace') {
        let allOptions = [];
        allOptions = allOptions.concat(getWeightedPlacement(state, random));
        allOptions = allOptions.concat(getWeightedMoves(state, random));
        allOptions.sort((a, b) => b.weight - a.weight);
        if (allOptions.length == 0) {
            return;
        }
        const choice = random ? pickRandom(allOptions) : randomWeighted(allOptions, 2);
        trailchess_1.validateState(state);
        if ('placeAt' in choice) {
            state.cg.state.pieces.set('a0', choice.piece);
            board_1.dropNewPiece(state.cg.state, 'a0', choice.placeAt, true);
        }
        else {
            makeMove(state, choice.move);
        }
    }
    else if (stage.kind == 'MovePlacedPiece') {
        const moves = getWeightedMoves(state, random);
        const choice = random ? pickRandom(moves) : randomWeighted(moves, 2);
        trailchess_1.validateState(state);
        makeMove(state, choice.move);
    }
    else if (stage.kind == 'ChooseTrail') {
        const trail = random ? pickRandom(stage.trails) : bestTrailChoice(state);
        // The trail always minimal length 2.
        // The first square may be shared by knight trails.
        state.cg.selectSquare(trail[1]);
    }
    state.cg.state.dom.redraw();
}
exports.aiPlay = aiPlay;

},{"./trailchess":21,"chessground/board":3,"chessground/util":17}],20:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = void 0;
const trailchess_1 = require("./trailchess");
const ai_1 = require("./ai");
const drag_1 = require("chessground/drag");
function run(element) {
    let state = trailchess_1.runTrailChess(element);
    element.addEventListener('trailchessStage', () => onStateUpdate(state));
    document.querySelector('.controls')
        .addEventListener('change', () => onStateUpdate(state));
    document.querySelector('.controls')
        .addEventListener('submit', e => e.preventDefault());
    for (const inputName of ['whitePlayer', 'blackPlayer']) {
        const input = document.forms['controls'].elements[inputName];
        if (!input.value) {
            input.value = 'human';
        }
    }
    document.querySelector('button.reset')
        .addEventListener('click', () => {
        state.cg.destroy();
        state = trailchess_1.runTrailChess(element);
        onStateUpdate(state);
    });
    for (const evType of ['mousedown', 'touchstart']) {
        document.querySelectorAll('.pocket').forEach(el => el.addEventListener(evType, (e) => {
            if (e.button !== undefined && e.button !== 0)
                return; // only touch or left click
            const el = e.target, role = el.getAttribute('data-role'), color = el.getAttribute('data-color'), count = el.getAttribute('data-count');
            if (!role || !color || count === '0')
                return;
            if (color !== state.color)
                return;
            e.stopPropagation();
            e.preventDefault();
            drag_1.dragNewPiece(state.cg.state, { color, role }, e);
        }));
    }
    onStateUpdate(state);
}
exports.run = run;
function onStateUpdate(state) {
    const inputName = state.color === 'white' ? 'whitePlayer' : 'blackPlayer';
    const input = document.forms['controls'].elements[inputName];
    if (input.value === 'ai') {
        setTimeout(() => ai_1.aiPlay(state, false), 1000);
    }
    else if (input.value === 'random') {
        setTimeout(() => ai_1.aiPlay(state, true), 1000);
    }
    for (const [color, roles] of state.pieceBank) {
        for (const [role, count] of roles) {
            const pieceEl = document.querySelector(`.pocket piece.${role}.${color}`);
            pieceEl.dataset.count = String(count);
        }
    }
}

},{"./ai":19,"./trailchess":21,"chessground/drag":6}],21:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllMoves = exports.getMoves = exports.setPieceTrail = exports.validateState = exports.deletePiece = exports.runTrailChess = void 0;
const chessground_1 = require("chessground");
const util_1 = require("chessground/util");
const premove_1 = require("chessground/premove");
const svg_1 = require("chessground/svg");
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
function runTrailChess(el) {
    const cg = chessground_1.Chessground(el, {
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
    let state = {
        cg: cg,
        stage: {
            kind: 'MoveOrPlace'
        },
        pieceIds: new Map(),
        trailMap: new Map(),
        trails: new Map(),
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
exports.runTrailChess = runTrailChess;
// https://github.com/ornicar/lila/blob/master/ui/round/src/crazy/crazyView.ts
function onDropNewPiece(state, piece, key) {
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
    const playerPieces = state.pieceBank.get(piece.color);
    const newPieceCount = playerPieces.get(piece.role) - 1;
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
    state.cg.set({ movable: { dests: movesToDests(state.movesMap) } });
    setStage(state, {
        kind: 'MovePlacedPiece',
        piece: piece,
        placedAt: key,
        movesMapBackup
    });
    state.cg.selectSquare(key);
}
function onChange(state) {
    const stage = state.stage;
    if (stage.kind == 'MovePlacedPiece' && !state.cg.state.pieces.has(stage.placedAt)) {
        // The newly placed piece was removed by dragging outside of the board
        deleteNewlyPlacedPiece(state, stage.placedAt);
    }
}
function onMove(state, orig, dest) {
    const stage = state.stage;
    if (stage.kind == 'MoveOrPlace' || stage.kind == 'MovePlacedPiece') {
        const piece = state.cg.state.pieces.get(dest);
        const pieceId = state.pieceIds.get(orig);
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
            state.cg.set({ movable: { dests: new Map() } });
            const oldTrail = state.trails.get(pieceId);
            deletePiece(state, pieceId, false);
            state.cg.state.pieces.delete(dest);
            setStage(state, { kind: 'ChooseTrail', trails, piece, pieceId, oldTrail });
        }
        else if (trails.length == 1) {
            growTrail(state, pieceId, trails[0], capturedPieceId != undefined);
        }
        else {
            throw Error('A valid move has zero trails ' + stage.kind);
        }
    }
    else {
        throw Error('Moved during a wrong stage ' + stage.kind);
    }
    drawState(state);
}
function setStage(state, stage) {
    state.stage = stage;
    const container = state.cg.state.dom.elements.container;
    console.log(JSON.stringify(stage));
    container.dispatchEvent(new Event('trailchessStage', { bubbles: true }));
}
function deletePiece(state, pieceId, deleteCg) {
    const trail = state.trails.get(pieceId);
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
exports.deletePiece = deletePiece;
// Is called from onmove and on choosing trail. The piece at orig may not exist on the board.
function growTrail(state, pieceId, trail, captured) {
    const dest = last(trail);
    const piece = state.cg.state.pieces.get(dest);
    const checkPromotion = () => {
        if (piece.role == 'pawn' && isPawnPromoted(state.trails.get(pieceId)[0], dest)) {
            state.cg.state.pieces.set(dest, { role: 'queen', color: piece.color, promoted: true });
        }
    };
    const endMove = () => {
        checkPromotion();
        playOtherSide(state);
        setStage(state, { kind: 'MoveOrPlace' });
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
    const cutPieceId = state.trailMap.get(cutSquare);
    const cutTrail = state.trails.get(cutPieceId);
    const cutPiece = state.cg.state.pieces.get(cutPieceId == pieceId ? dest : last(cutTrail));
    let candidateTrails;
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
    }
    else {
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
    }
    else if (candidateTrails.length == 1) {
        const trail = candidateTrails[0];
        const dest = last(trail);
        placePieceCG(state, cutPiece, dest);
        state.pieceIds.set(dest, cutPieceId);
        setPieceTrail(state, cutPieceId, trail);
        endMove();
    }
    else {
        state.cg.set({ movable: { dests: new Map() } });
        if (pieceId == cutPieceId) {
            state.cg.state.pieces.delete(dest);
        }
        checkPromotion();
        setStage(state, {
            kind: 'ChooseTrail',
            trails: candidateTrails,
            piece: cutPiece,
            pieceId: cutPieceId
        });
    }
    validateState(state);
}
function splitSelfTrail(oldTrail, newTrail) {
    const newTrailSet = new Set(newTrail);
    const trails = [];
    let current = [];
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
        }
        else {
            current.push(key);
        }
    }
    if (current.length) {
        trails.push(current);
    }
    return trails;
}
function validateState(state) {
    let assert = (msg, isGood) => {
        if (!isGood) {
            throw new Error(msg);
        }
    };
    let setEq = (s1, s2) => s1.size === s2.size && [...s1].every(x => s2.has(x));
    const pieceIdSet = new Set(state.pieceIds.values());
    // chess fen is longer - it includes turn
    assert('Each key has a unique pieceId', pieceIdSet.size == state.pieceIds.size);
    assert('PieceIds and trails correspond', setEq(pieceIdSet, new Set(state.trails.keys())));
    assert('PieceIds and chessground correspond', setEq(new Set(state.pieceIds.keys()), new Set(state.cg.state.pieces.keys())));
    [...state.pieceIds.entries()].every(([key, pieceId]) => {
        const trail = state.trails.get(pieceId);
        assert(`PieceId ${pieceId} is at the key at the end its trail`, last(trail) == key);
    });
    assert('trailMap has correct pieceIds', setEq(pieceIdSet, new Set(state.trailMap.values())));
    // Together these checks also ensure that trailMap has no entries that are not in trails
    state.trails.forEach((trail, pieceId) => {
        assert(`Trail for pieceId ${pieceId} has unique keys`, trail.length == (new Set(trail)).size);
        // This check also ensures that trails do not overlap
        assert(`Trail for pieceId ${pieceId} is in trailMap`, trail.every(key => state.trailMap.get(key) == pieceId));
        for (let i = 0; i < trail.length - 1; i++) {
            const [x1, y1] = util_1.key2pos(trail[i]);
            const [x2, y2] = util_1.key2pos(trail[i + 1]);
            assert(`Trail for pieceId ${pieceId} must consist of adjacent squares`, Math.abs(x1 - x2) <= 1 && Math.abs(y1 - y2) <= 1);
        }
    });
    assert(`TrailMap has tracks the same number of keys as trails`, state.trailMap.size == [...state.trails.values()].reduce((acc, t) => acc + t.length, 0));
}
exports.validateState = validateState;
function setPieceTrail(state, pieceId, trail) {
    for (const key of trail) {
        state.trailMap.set(key, pieceId);
    }
    let pieceTrail = state.trails.get(pieceId);
    if (!pieceTrail) {
        state.trails.set(pieceId, trail);
    }
    else {
        const newSquares = trail.slice(1);
        state.trails.set(pieceId, pieceTrail.concat(newSquares));
    }
}
exports.setPieceTrail = setPieceTrail;
function getTrailsForMove(role, orig, dest) {
    function lineToTrail([x1, y1], [x2, y2]) {
        // Makes a sequence of adjacent keys
        // The knight path is split in two straight segments, so
        // a trail can only have straight or diagonal segments.
        const path = [util_1.pos2key([x1, y1])];
        const xDelta = Math.sign(x2 - x1); // +1, -1, 0
        const yDelta = Math.sign(y2 - y1); // +1, -1, 0
        // This loop will hang if the segments aren't straight or diagonal.
        let x = x1, y = y1;
        do {
            x += xDelta;
            y += yDelta;
            path.push(util_1.pos2key([x, y]));
        } while (x != x2 || y != y2);
        return path;
    }
    // Knight can have two trails for the same move.
    const [x1, y1] = util_1.key2pos(orig), [x2, y2] = util_1.key2pos(dest);
    if (role == 'knight') {
        return [
            lineToTrail([x1, y1], [x1, y2]).concat(lineToTrail([x1, y2], [x2, y2]).slice(1)),
            lineToTrail([x1, y1], [x2, y1]).concat(lineToTrail([x2, y1], [x2, y2]).slice(1))
        ];
    }
    else {
        return [lineToTrail([x1, y1], [x2, y2])];
    }
}
const makeStartingPieces = () => new Map([
    ['queen', 1],
    ['rook', 2],
    ['bishop', 2],
    ['knight', 2],
    ['pawn', 8]
]);
function placePieceCG(state, piece, key) {
    // Update the state directly. The function dropNewPiece changes color and movables.
    state.cg.state.pieces.set(key, piece);
}
function onSelect(state, key) {
    var _a;
    const stage = state.stage;
    if (((_a = state.cg.state.lastMove) === null || _a === void 0 ? void 0 : _a.length) == 2 && state.cg.state.lastMove[1] == key) {
        if (stage.kind != 'ChooseTrail') {
            // If onSelect was invoked as a result of the move, let onMove handle the change.
            // We can only indirectly deduce it from the stage. Also, it can be a click selecting a piece.
            return;
        }
    }
    if (stage.kind == 'MovePlacedPiece') {
        if (state.cg.state.selected !== stage.placedAt) {
            state.cg.selectSquare(stage.placedAt);
        }
        else {
            state.cg.state.draggable.deleteOnDropOff = true;
        }
        return;
    }
    else if (stage.kind == 'ChooseTrail') {
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
function logState(state) {
    console.log(state.cg.state.turnColor);
    console.log(state.stage.kind);
    console.log('pieceIds', JSON.stringify([...state.pieceIds]));
    console.log('trailMap', JSON.stringify([...state.trailMap]));
    console.log('trails', JSON.stringify([...state.trails]));
}
function drawState(state) {
    const stage = state.stage;
    logState(state);
    const container = state.cg.state.dom.elements.container;
    let trailsSvg = container.querySelector('.cg-trails');
    if (!trailsSvg) {
        trailsSvg = svg_1.setAttributes(svg_1.createElement('svg'), { 'class': 'cg-trails' });
        trailsSvg.appendChild(svg_1.createElement('g'));
        container.appendChild(trailsSvg);
    }
    const trailsToDraw = [];
    for (const trail of state.trails.values()) {
        const position = last(trail);
        const { color } = state.cg.state.pieces.get(position);
        trailsToDraw.push({ classes: [`trail-${color}`], trail });
    }
    if (stage.kind == 'ChooseTrail') {
        stage.trails.forEach(trail => trailsToDraw.push({ classes: [`trail-choose`, `trail-${stage.piece.color}`], trail }));
        if (stage.oldTrail) {
            trailsToDraw.push({ classes: [`trail-${stage.piece.color}`], trail: stage.oldTrail });
        }
    }
    const shapes = [];
    if (stage.kind == 'ChooseTrail') {
        stage.trails.forEach(trail => shapes.push({
            orig: last(trail),
            piece: stage.piece
        }));
    }
    syncTrailsSvg(state.cg, trailsSvg.querySelector('g'), trailsToDraw);
    state.cg.setAutoShapes(shapes);
    validateState(state);
}
function drawTrail(cg, classes, trail) {
    function pos2px(pos, bounds) {
        return [((pos[0] + 0.5) * bounds.width) / 8, ((7.5 - pos[1]) * bounds.height) / 8];
    }
    const bounds = cg.state.dom.bounds();
    const lineWidth = (10 / 512) * bounds.width;
    const points = trail.map(s => {
        const [x, y] = pos2px(util_1.key2pos(s), bounds);
        return x + ',' + y;
    }).join(' ');
    return svg_1.setAttributes(svg_1.createElement('polyline'), {
        class: "trail " + classes.join(' '),
        'stroke-width': lineWidth,
        points: points
    });
}
function syncTrailsSvg(cg, root, trails) {
    const hashTrail = (trail, classes) => classes + JSON.stringify(trail);
    const trailsInDom = new Map(), // by hash
    toRemove = [];
    for (const { trail, classes } of trails)
        trailsInDom.set(hashTrail(trail, classes), false);
    let el = root.firstChild, trailKeys;
    while (el) {
        trailKeys = el.getAttribute('cgTrail');
        // found a shape element that's here to stay
        if (trailsInDom.has(trailKeys))
            trailsInDom.set(trailKeys, true);
        // or remove it
        else
            toRemove.push(el);
        el = el.nextSibling;
    }
    // remove old shapes
    for (const el of toRemove)
        root.removeChild(el);
    // insert shapes that are not yet in dom
    for (const { trail, classes } of trails) {
        if (!trailsInDom.get(hashTrail(trail, classes)))
            root.appendChild(drawTrail(cg, classes, trail));
    }
}
function last(arr) {
    return arr[arr.length - 1];
}
function deleteNewlyPlacedPiece(state, key) {
    const stage = state.stage;
    if (stage.kind !== 'MovePlacedPiece') {
        throw 'Expected MovePlacePiece stage';
    }
    const piece = stage.piece;
    deletePiece(state, state.pieceIds.get(key), true);
    state.movesMap = stage.movesMapBackup;
    state.cg.set({
        movable: {
            dests: movesToDests(state.movesMap)
        },
        lastMove: state.lastMove,
        selected: undefined
    });
    const playerPieces = state.pieceBank.get(piece.color);
    const newPieceCount = playerPieces.get(piece.role) + 1;
    playerPieces.set(piece.role, newPieceCount);
    const pieceEl = document.querySelector(`.pocket .${piece.role}.${piece.color}`);
    pieceEl.dataset.count = String(newPieceCount);
    setStage(state, { kind: 'MoveOrPlace' });
}
function analyzeFutureTrail(state, piece, trail, allowCut, isMoved) {
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
    const pieceId = state.pieceIds.get(trail[0]);
    let cutPieceId = undefined;
    let cutSquare = undefined;
    const capturedPieceId = state.pieceIds.get(dest);
    const capturedPiece = state.cg.state.pieces.get(dest);
    for (const s of trail.slice(1)) {
        const pieceIdOnTrail = state.trailMap.get(s);
        if (pieceIdOnTrail == undefined) {
            continue;
        }
        else if (!allowCut) {
            return null;
        }
        const pieceOnTrail = state.cg.state.pieces.get(s);
        if (pieceOnTrail) {
            if (s != dest) {
                // The trail cannot have any pieces till the end.
                return null;
            }
            else if (!isMoved && pieceOnTrail.color == piece.color) {
                // Cannot capture piece of own color at the end of the trail.
                // If isValidFutureTrail is called before move, dest has a piece of opposite color
                // that would be captured. If called on move, it would be the piece that moved.
                return null;
            }
        }
        if (pieceIdOnTrail == capturedPieceId) {
        }
        else if (cutPieceId == undefined) {
            cutPieceId = pieceIdOnTrail;
            cutSquare = s;
        }
        else if (pieceIdOnTrail != cutPieceId) {
            return null; // Cutting trails of two pieces
        }
        else if (pieceIdOnTrail != pieceId) {
            return null; // Going through many squares of a trail instead of cutting it
        }
    }
    let cuts = undefined;
    if (cutPieceId != undefined) {
        let isErased = false;
        const cutTrail = state.trails.get(cutPieceId);
        const piece = state.cg.state.pieces.get(last(cutTrail));
        if (cutPieceId != pieceId) {
            const before = cutTrail.slice(0, cutTrail.indexOf(cutSquare));
            const after = cutTrail.slice(cutTrail.indexOf(cutSquare) + 1);
            isErased = !isValidSubTrail(before) && !isValidSubTrail(after);
        }
        cuts = { pieceId: cutPieceId, piece, isErased };
    }
    const captures = capturedPieceId !== undefined ? { pieceId: capturedPieceId, piece: capturedPiece } : undefined;
    return { piece, pieceId, captures, cuts, trail };
}
function isValidSubTrail(trail) {
    // any trail longer than the current square is fine. For the knight too
    return trail.length > 1;
}
function isPawnPromoted(trailStart, dest) {
    const [[x1, y1], [x2, y2]] = [trailStart, dest].map(util_1.key2pos);
    const [xDelta, yDelta] = [x2 - x1, y2 - y1];
    const getEdgeIndex = delta => delta == 0 ? null : (delta < 0 ? 0 : 7);
    const [xEdge, yEdge] = [getEdgeIndex(xDelta), getEdgeIndex(yDelta)];
    if (Math.abs(xDelta) == Math.abs(yDelta)) {
        return x2 == xEdge || y2 == yEdge;
    }
    else {
        return Math.abs(xDelta) > Math.abs(yDelta) ? x2 == xEdge : y2 == yEdge;
    }
}
function getMoves(state, key, allowCapture, allowCut) {
    const selfPieceId = state.pieceIds.get(key);
    const piece = state.cg.state.pieces.get(key);
    if (selfPieceId === undefined || piece === undefined) {
        throw new Error('No piece found');
    }
    let dests;
    if (piece.role == 'pawn') {
        const trail = state.trails.get(selfPieceId);
        if (trail.length == 1) {
            // The first move only depends on the quadrant. No capture.
            const [x, y] = util_1.key2pos(key);
            const xSign = x < 4 ? 1 : -1; // Move toward further edge.
            const ySign = y < 4 ? 1 : -1;
            dests = [[x + 1 * xSign, y], [x + 2 * xSign, y], [x, y + 1 * ySign],
                [x, y + 2 * ySign]].map(util_1.pos2key);
        }
        else {
            // Continue in the direction. If the bounding rectangle of the trail is a square,
            // the pawn can still choose the direction. For example, pawn only moved diagonally with captures.
            const [[x1, y1], [x2, y2]] = [trail[0], last(trail)].map(util_1.key2pos);
            const [xDelta, yDelta] = [x2 - x1, y2 - y1];
            const isPosValid = ([x, y]) => x >= 0 && x < 8 && y >= 0 && y < 8;
            let pawnMoves;
            const xMoves = [[[x2 + Math.sign(xDelta), y2 - 1], true], [[x2 + Math.sign(xDelta), y2], false], [[x2 + Math.sign(xDelta), y2 + 1], true]];
            const yMoves = [[[x2 - 1, y2 + Math.sign(yDelta)], true], [[x2, y2 + Math.sign(yDelta)], false], [[x2 + 1, y2 + Math.sign(yDelta)], true]];
            if (Math.abs(xDelta) == Math.abs(yDelta)) {
                pawnMoves = [...xMoves, ...yMoves];
            }
            else {
                pawnMoves = Math.abs(xDelta) > Math.abs(yDelta) ? xMoves : yMoves;
            }
            dests = pawnMoves.filter(([pos, _]) => isPosValid(pos))
                // Filter out the diagonal moves if there is no piece to capture
                .filter(([pos, capture]) => state.cg.state.pieces.has(util_1.pos2key(pos)) ? capture : !capture)
                .map(([pos, _]) => util_1.pos2key(pos));
            dests = [...new Set([...dests])]; // x and y may overlap.
        }
    }
    else {
        dests = premove_1.premove(state.cg.state.pieces, key, false);
    }
    const moves = [];
    for (const dest of dests) {
        if (!allowCapture && state.cg.state.pieces.has(dest))
            continue;
        for (const trail of getTrailsForMove(piece.role, key, dest)) {
            const move = analyzeFutureTrail(state, piece, trail, allowCut, false);
            if (!move)
                continue;
            moves.push(move);
        }
    }
    return moves;
}
exports.getMoves = getMoves;
function movesToDests(movesMap) {
    const destsMap = new Map();
    for (const [s, moves] of movesMap) {
        destsMap.set(s, moves.map(m => last(m.trail)));
    }
    return destsMap;
}
function playOtherSide(state) {
    const color = util_1.opposite(state.color);
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
function getAllMoves(state) {
    const moves = new Map();
    for (const s of state.cg.state.pieces.keys()) {
        const pieceMoves = getMoves(state, s, true, true);
        if (pieceMoves.length)
            moves.set(s, pieceMoves);
    }
    return moves;
}
exports.getAllMoves = getAllMoves;

},{"chessground":4,"chessground/premove":12,"chessground/svg":15,"chessground/util":17}]},{},[20])(20)
});

//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmQvYW5pbS5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZC9hcGkuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmQvYm9hcmQuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmQvY2hlc3Nncm91bmQuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmQvY29uZmlnLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5kL2RyYWcuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmQvZHJhdy5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZC9kcm9wLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5kL2V2ZW50cy5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZC9leHBsb3Npb24uanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmQvZmVuLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5kL3ByZW1vdmUuanMiLCJub2RlX21vZHVsZXMvY2hlc3Nncm91bmQvcmVuZGVyLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5kL3N0YXRlLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5kL3N2Zy5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZC90eXBlcy5qcyIsIm5vZGVfbW9kdWxlcy9jaGVzc2dyb3VuZC91dGlsLmpzIiwibm9kZV9tb2R1bGVzL2NoZXNzZ3JvdW5kL3dyYXAuanMiLCJzcmMvYWkudHMiLCJzcmMvbWFpbi50cyIsInNyYy90cmFpbGNoZXNzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3R0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOVZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbk1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNB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QyxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLEVBQUUsQ0FBQyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsRUFBRSxFQUFFLEdBQUcsQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNoSSxNQUFNLE1BQU0sR0FDUixDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLEtBQUssQ0FBQyxFQUFFLENBQUMsQ0FBQyxFQUFFLEdBQUcsQ0FBQyxFQUFFLEVBQUUsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNoSSxJQUFJLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRTtnQkFDdEMsU0FBUyxHQUFHLENBQUMsR0FBRyxNQUFNLEVBQUUsR0FBRyxNQUFNLENBQUMsQ0FBQzthQUN0QztpQkFBTTtnQkFDSCxTQUFTLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQzthQUNyRTtZQUNELEtBQUssR0FBRyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMs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LE1BQU0sVUFBVSxHQUFHLFFBQVEsQ0FBQyxLQUFLLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNsRCxJQUFJLFVBQVUsQ0FBQyxNQUFNO1lBQUUsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEVBQUUsVUFBVSxDQUFDLENBQUM7S0FDbkQ7SUFDRCxPQUFPLEtBQUssQ0FBQztBQUNqQixDQUFDO0FBUEQsa0NBT0MiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmV4cG9ydHMucmVuZGVyID0gZXhwb3J0cy5hbmltID0gdm9pZCAwO1xuY29uc3QgdXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5mdW5jdGlvbiBhbmltKG11dGF0aW9uLCBzdGF0ZSkge1xuICAgIHJldHVybiBzdGF0ZS5hbmltYXRpb24uZW5hYmxlZCA/IGFuaW1hdGUobXV0YXRpb24sIHN0YXRlKSA6IHJlbmRlcihtdXRhdGlvbiwgc3RhdGUpO1xufVxuZXhwb3J0cy5hbmltID0gYW5pbTtcbmZ1bmN0aW9uIHJlbmRlcihtdXRhdGlvbiwgc3RhdGUpIHtcbiAgICBjb25zdCByZXN1bHQgPSBtdXRhdGlvbihzdGF0ZSk7XG4gICAgc3RhdGUuZG9tLnJlZHJhdygpO1xuICAgIHJldHVybiByZXN1bHQ7XG59XG5leHBvcnRzLnJlbmRlciA9IHJlbmRlcjtcbmZ1bmN0aW9uIG1ha2VQaWVjZShrZXksIHBpZWNlKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAga2V5OiBrZXksXG4gICAgICAgIHBvczogdXRpbC5rZXkycG9zKGtleSksXG4gICAgICAgIHBpZWNlOiBwaWVjZSxcbiAgICB9O1xufVxuZnVuY3Rpb24gY2xvc2VyKHBpZWNlLCBwaWVjZXMpIHtcbiAgICByZXR1cm4gcGllY2VzLnNvcnQoKHAxLCBwMikgPT4ge1xuICAgICAgICByZXR1cm4gdXRpbC5kaXN0YW5jZVNxKHBpZWNlLnBvcywgcDEucG9zKSAtIHV0aWwuZGlzdGFuY2VTcShwaWVjZS5wb3MsIHAyLnBvcyk7XG4gICAgfSlbMF07XG59XG5mdW5jdGlvbiBjb21wdXRlUGxhbihwcmV2UGllY2VzLCBjdXJyZW50KSB7XG4gICAgY29uc3QgYW5pbXMgPSBuZXcgTWFwKCksIGFuaW1lZE9yaWdzID0gW10sIGZhZGluZ3MgPSBuZXcgTWFwKCksIG1pc3NpbmdzID0gW10sIG5ld3MgPSBbXSwgcHJlUGllY2VzID0gbmV3IE1hcCgpO1xuICAgIGxldCBjdXJQLCBwcmVQLCB2ZWN0b3I7XG4gICAgZm9yIChjb25zdCBbaywgcF0gb2YgcHJldlBpZWNlcykge1xuICAgICAgICBwcmVQaWVjZXMuc2V0KGssIG1ha2VQaWVjZShrLCBwKSk7XG4gICAgfVxuICAgIGZvciAoY29uc3Qga2V5IG9mIHV0aWwuYWxsS2V5cykge1xuICAgICAgICBjdXJQID0gY3VycmVudC5waWVjZXMuZ2V0KGtleSk7XG4gICAgICAgIHByZVAgPSBwcmVQaWVjZXMuZ2V0KGtleSk7XG4gICAgICAgIGlmIChjdXJQKSB7XG4gICAgICAgICAgICBpZiAocHJlUCkge1xuICAgICAgICAgICAgICAgIGlmICghdXRpbC5zYW1lUGllY2UoY3VyUCwgcHJlUC5waWVjZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgbWlzc2luZ3MucHVzaChwcmVQKTtcbiAgICAgICAgICAgICAgICAgICAgbmV3cy5wdXNoKG1ha2VQaWVjZShrZXksIGN1clApKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgbmV3cy5wdXNoKG1ha2VQaWVjZShrZXksIGN1clApKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmIChwcmVQKVxuICAgICAgICAgICAgbWlzc2luZ3MucHVzaChwcmVQKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBuZXdQIG9mIG5ld3MpIHtcbiAgICAgICAgcHJlUCA9IGNsb3NlcihuZXdQLCBtaXNzaW5ncy5maWx0ZXIocCA9PiB1dGlsLnNhbWVQaWVjZShuZXdQLnBpZWNlLCBwLnBpZWNlKSkpO1xuICAgICAgICBpZiAocHJlUCkge1xuICAgICAgICAgICAgdmVjdG9yID0gW3ByZVAucG9zWzBdIC0gbmV3UC5wb3NbMF0sIHByZVAucG9zWzFdIC0gbmV3UC5wb3NbMV1dO1xuICAgICAgICAgICAgYW5pbXMuc2V0KG5ld1Aua2V5LCB2ZWN0b3IuY29uY2F0KHZlY3RvcikpO1xuICAgICAgICAgICAgYW5pbWVkT3JpZ3MucHVzaChwcmVQLmtleSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCBwIG9mIG1pc3NpbmdzKSB7XG4gICAgICAgIGlmICghYW5pbWVkT3JpZ3MuaW5jbHVkZXMocC5rZXkpKVxuICAgICAgICAgICAgZmFkaW5ncy5zZXQocC5rZXksIHAucGllY2UpO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICBhbmltczogYW5pbXMsXG4gICAgICAgIGZhZGluZ3M6IGZhZGluZ3MsXG4gICAgfTtcbn1cbmZ1bmN0aW9uIHN0ZXAoc3RhdGUsIG5vdykge1xuICAgIGNvbnN0IGN1ciA9IHN0YXRlLmFuaW1hdGlvbi5jdXJyZW50O1xuICAgIGlmIChjdXIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBpZiAoIXN0YXRlLmRvbS5kZXN0cm95ZWQpXG4gICAgICAgICAgICBzdGF0ZS5kb20ucmVkcmF3Tm93KCk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3QgcmVzdCA9IDEgLSAobm93IC0gY3VyLnN0YXJ0KSAqIGN1ci5mcmVxdWVuY3k7XG4gICAgaWYgKHJlc3QgPD0gMCkge1xuICAgICAgICBzdGF0ZS5hbmltYXRpb24uY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICAgICAgc3RhdGUuZG9tLnJlZHJhd05vdygpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgY29uc3QgZWFzZSA9IGVhc2luZyhyZXN0KTtcbiAgICAgICAgZm9yIChjb25zdCBjZmcgb2YgY3VyLnBsYW4uYW5pbXMudmFsdWVzKCkpIHtcbiAgICAgICAgICAgIGNmZ1syXSA9IGNmZ1swXSAqIGVhc2U7XG4gICAgICAgICAgICBjZmdbM10gPSBjZmdbMV0gKiBlYXNlO1xuICAgICAgICB9XG4gICAgICAgIHN0YXRlLmRvbS5yZWRyYXdOb3codHJ1ZSk7XG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgobm93ID0gcGVyZm9ybWFuY2Uubm93KCkpID0+IHN0ZXAoc3RhdGUsIG5vdykpO1xuICAgIH1cbn1cbmZ1bmN0aW9uIGFuaW1hdGUobXV0YXRpb24sIHN0YXRlKSB7XG4gICAgY29uc3QgcHJldlBpZWNlcyA9IG5ldyBNYXAoc3RhdGUucGllY2VzKTtcbiAgICBjb25zdCByZXN1bHQgPSBtdXRhdGlvbihzdGF0ZSk7XG4gICAgY29uc3QgcGxhbiA9IGNvbXB1dGVQbGFuKHByZXZQaWVjZXMsIHN0YXRlKTtcbiAgICBpZiAocGxhbi5hbmltcy5zaXplIHx8IHBsYW4uZmFkaW5ncy5zaXplKSB7XG4gICAgICAgIGNvbnN0IGFscmVhZHlSdW5uaW5nID0gc3RhdGUuYW5pbWF0aW9uLmN1cnJlbnQgJiYgc3RhdGUuYW5pbWF0aW9uLmN1cnJlbnQuc3RhcnQ7XG4gICAgICAgIHN0YXRlLmFuaW1hdGlvbi5jdXJyZW50ID0ge1xuICAgICAgICAgICAgc3RhcnQ6IHBlcmZvcm1hbmNlLm5vdygpLFxuICAgICAgICAgICAgZnJlcXVlbmN5OiAxIC8gc3RhdGUuYW5pbWF0aW9uLmR1cmF0aW9uLFxuICAgICAgICAgICAgcGxhbjogcGxhbixcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKCFhbHJlYWR5UnVubmluZylcbiAgICAgICAgICAgIHN0ZXAoc3RhdGUsIHBlcmZvcm1hbmNlLm5vdygpKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHN0YXRlLmRvbS5yZWRyYXcoKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cbmZ1bmN0aW9uIGVhc2luZyh0KSB7XG4gICAgcmV0dXJuIHQgPCAwLjUgPyA0ICogdCAqIHQgKiB0IDogKHQgLSAxKSAqICgyICogdCAtIDIpICogKDIgKiB0IC0gMikgKyAxO1xufVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9YW5pbS5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmV4cG9ydHMuc3RhcnQgPSB2b2lkIDA7XG5jb25zdCBib2FyZCA9IHJlcXVpcmUoXCIuL2JvYXJkXCIpO1xuY29uc3QgZmVuXzEgPSByZXF1aXJlKFwiLi9mZW5cIik7XG5jb25zdCBjb25maWdfMSA9IHJlcXVpcmUoXCIuL2NvbmZpZ1wiKTtcbmNvbnN0IGFuaW1fMSA9IHJlcXVpcmUoXCIuL2FuaW1cIik7XG5jb25zdCBkcmFnXzEgPSByZXF1aXJlKFwiLi9kcmFnXCIpO1xuY29uc3QgZXhwbG9zaW9uXzEgPSByZXF1aXJlKFwiLi9leHBsb3Npb25cIik7XG5mdW5jdGlvbiBzdGFydChzdGF0ZSwgcmVkcmF3QWxsKSB7XG4gICAgZnVuY3Rpb24gdG9nZ2xlT3JpZW50YXRpb24oKSB7XG4gICAgICAgIGJvYXJkLnRvZ2dsZU9yaWVudGF0aW9uKHN0YXRlKTtcbiAgICAgICAgcmVkcmF3QWxsKCk7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIHNldChjb25maWcpIHtcbiAgICAgICAgICAgIGlmIChjb25maWcub3JpZW50YXRpb24gJiYgY29uZmlnLm9yaWVudGF0aW9uICE9PSBzdGF0ZS5vcmllbnRhdGlvbilcbiAgICAgICAgICAgICAgICB0b2dnbGVPcmllbnRhdGlvbigpO1xuICAgICAgICAgICAgKGNvbmZpZy5mZW4gPyBhbmltXzEuYW5pbSA6IGFuaW1fMS5yZW5kZXIpKHN0YXRlID0+IGNvbmZpZ18xLmNvbmZpZ3VyZShzdGF0ZSwgY29uZmlnKSwgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBzdGF0ZSxcbiAgICAgICAgZ2V0RmVuOiAoKSA9PiBmZW5fMS53cml0ZShzdGF0ZS5waWVjZXMpLFxuICAgICAgICB0b2dnbGVPcmllbnRhdGlvbixcbiAgICAgICAgc2V0UGllY2VzKHBpZWNlcykge1xuICAgICAgICAgICAgYW5pbV8xLmFuaW0oc3RhdGUgPT4gYm9hcmQuc2V0UGllY2VzKHN0YXRlLCBwaWVjZXMpLCBzdGF0ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIHNlbGVjdFNxdWFyZShrZXksIGZvcmNlKSB7XG4gICAgICAgICAgICBpZiAoa2V5KVxuICAgICAgICAgICAgICAgIGFuaW1fMS5hbmltKHN0YXRlID0+IGJvYXJkLnNlbGVjdFNxdWFyZShzdGF0ZSwga2V5LCBmb3JjZSksIHN0YXRlKTtcbiAgICAgICAgICAgIGVsc2UgaWYgKHN0YXRlLnNlbGVjdGVkKSB7XG4gICAgICAgICAgICAgICAgYm9hcmQudW5zZWxlY3Qoc3RhdGUpO1xuICAgICAgICAgICAgICAgIHN0YXRlLmRvbS5yZWRyYXcoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgbW92ZShvcmlnLCBkZXN0KSB7XG4gICAgICAgICAgICBhbmltXzEuYW5pbShzdGF0ZSA9PiBib2FyZC5iYXNlTW92ZShzdGF0ZSwgb3JpZywgZGVzdCksIHN0YXRlKTtcbiAgICAgICAgfSxcbiAgICAgICAgbmV3UGllY2UocGllY2UsIGtleSkge1xuICAgICAgICAgICAgYW5pbV8xLmFuaW0oc3RhdGUgPT4gYm9hcmQuYmFzZU5ld1BpZWNlKHN0YXRlLCBwaWVjZSwga2V5KSwgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBwbGF5UHJlbW92ZSgpIHtcbiAgICAgICAgICAgIGlmIChzdGF0ZS5wcmVtb3ZhYmxlLmN1cnJlbnQpIHtcbiAgICAgICAgICAgICAgICBpZiAoYW5pbV8xLmFuaW0oYm9hcmQucGxheVByZW1vdmUsIHN0YXRlKSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgICAgICAgICAgc3RhdGUuZG9tLnJlZHJhdygpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9LFxuICAgICAgICBwbGF5UHJlZHJvcCh2YWxpZGF0ZSkge1xuICAgICAgICAgICAgaWYgKHN0YXRlLnByZWRyb3BwYWJsZS5jdXJyZW50KSB7XG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYm9hcmQucGxheVByZWRyb3Aoc3RhdGUsIHZhbGlkYXRlKTtcbiAgICAgICAgICAgICAgICBzdGF0ZS5kb20ucmVkcmF3KCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSxcbiAgICAgICAgY2FuY2VsUHJlbW92ZSgpIHtcbiAgICAgICAgICAgIGFuaW1fMS5yZW5kZXIoYm9hcmQudW5zZXRQcmVtb3ZlLCBzdGF0ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIGNhbmNlbFByZWRyb3AoKSB7XG4gICAgICAgICAgICBhbmltXzEucmVuZGVyKGJvYXJkLnVuc2V0UHJlZHJvcCwgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBjYW5jZWxNb3ZlKCkge1xuICAgICAgICAgICAgYW5pbV8xLnJlbmRlcihzdGF0ZSA9PiB7XG4gICAgICAgICAgICAgICAgYm9hcmQuY2FuY2VsTW92ZShzdGF0ZSk7XG4gICAgICAgICAgICAgICAgZHJhZ18xLmNhbmNlbChzdGF0ZSk7XG4gICAgICAgICAgICB9LCBzdGF0ZSk7XG4gICAgICAgIH0sXG4gICAgICAgIHN0b3AoKSB7XG4gICAgICAgICAgICBhbmltXzEucmVuZGVyKHN0YXRlID0+IHtcbiAgICAgICAgICAgICAgICBib2FyZC5zdG9wKHN0YXRlKTtcbiAgICAgICAgICAgICAgICBkcmFnXzEuY2FuY2VsKHN0YXRlKTtcbiAgICAgICAgICAgIH0sIHN0YXRlKTtcbiAgICAgICAgfSxcbiAgICAgICAgZXhwbG9kZShrZXlzKSB7XG4gICAgICAgICAgICBleHBsb3Npb25fMS5leHBsb3Npb24oc3RhdGUsIGtleXMpO1xuICAgICAgICB9LFxuICAgICAgICBzZXRBdXRvU2hhcGVzKHNoYXBlcykge1xuICAgICAgICAgICAgYW5pbV8xLnJlbmRlcihzdGF0ZSA9PiAoc3RhdGUuZHJhd2FibGUuYXV0b1NoYXBlcyA9IHNoYXBlcyksIHN0YXRlKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0U2hhcGVzKHNoYXBlcykge1xuICAgICAgICAgICAgYW5pbV8xLnJlbmRlcihzdGF0ZSA9PiAoc3RhdGUuZHJhd2FibGUuc2hhcGVzID0gc2hhcGVzKSwgc3RhdGUpO1xuICAgICAgICB9LFxuICAgICAgICBnZXRLZXlBdERvbVBvcyhwb3MpIHtcbiAgICAgICAgICAgIHJldHVybiBib2FyZC5nZXRLZXlBdERvbVBvcyhwb3MsIGJvYXJkLndoaXRlUG92KHN0YXRlKSwgc3RhdGUuZG9tLmJvdW5kcygpKTtcbiAgICAgICAgfSxcbiAgICAgICAgcmVkcmF3QWxsLFxuICAgICAgICBkcmFnTmV3UGllY2UocGllY2UsIGV2ZW50LCBmb3JjZSkge1xuICAgICAgICAgICAgZHJhZ18xLmRyYWdOZXdQaWVjZShzdGF0ZSwgcGllY2UsIGV2ZW50LCBmb3JjZSk7XG4gICAgICAgIH0sXG4gICAgICAgIGRlc3Ryb3koKSB7XG4gICAgICAgICAgICBib2FyZC5zdG9wKHN0YXRlKTtcbiAgICAgICAgICAgIHN0YXRlLmRvbS51bmJpbmQgJiYgc3RhdGUuZG9tLnVuYmluZCgpO1xuICAgICAgICAgICAgc3RhdGUuZG9tLmRlc3Ryb3llZCA9IHRydWU7XG4gICAgICAgIH0sXG4gICAgfTtcbn1cbmV4cG9ydHMuc3RhcnQgPSBzdGFydDtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWFwaS5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmV4cG9ydHMud2hpdGVQb3YgPSBleHBvcnRzLmdldFNuYXBwZWRLZXlBdERvbVBvcyA9IGV4cG9ydHMuZ2V0S2V5QXREb21Qb3MgPSBleHBvcnRzLnN0b3AgPSBleHBvcnRzLmNhbmNlbE1vdmUgPSBleHBvcnRzLnBsYXlQcmVkcm9wID0gZXhwb3J0cy5wbGF5UHJlbW92ZSA9IGV4cG9ydHMuaXNEcmFnZ2FibGUgPSBleHBvcnRzLmNhbk1vdmUgPSBleHBvcnRzLnVuc2VsZWN0ID0gZXhwb3J0cy5zZXRTZWxlY3RlZCA9IGV4cG9ydHMuc2VsZWN0U3F1YXJlID0gZXhwb3J0cy5kcm9wTmV3UGllY2UgPSBleHBvcnRzLnVzZXJNb3ZlID0gZXhwb3J0cy5iYXNlTmV3UGllY2UgPSBleHBvcnRzLmJhc2VNb3ZlID0gZXhwb3J0cy51bnNldFByZWRyb3AgPSBleHBvcnRzLnVuc2V0UHJlbW92ZSA9IGV4cG9ydHMuc2V0Q2hlY2sgPSBleHBvcnRzLnNldFBpZWNlcyA9IGV4cG9ydHMucmVzZXQgPSBleHBvcnRzLnRvZ2dsZU9yaWVudGF0aW9uID0gZXhwb3J0cy5jYWxsVXNlckZ1bmN0aW9uID0gdm9pZCAwO1xuY29uc3QgdXRpbF8xID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmNvbnN0IHByZW1vdmVfMSA9IHJlcXVpcmUoXCIuL3ByZW1vdmVcIik7XG5mdW5jdGlvbiBjYWxsVXNlckZ1bmN0aW9uKGYsIC4uLmFyZ3MpIHtcbiAgICBpZiAoZilcbiAgICAgICAgc2V0VGltZW91dCgoKSA9PiBmKC4uLmFyZ3MpLCAxKTtcbn1cbmV4cG9ydHMuY2FsbFVzZXJGdW5jdGlvbiA9IGNhbGxVc2VyRnVuY3Rpb247XG5mdW5jdGlvbiB0b2dnbGVPcmllbnRhdGlvbihzdGF0ZSkge1xuICAgIHN0YXRlLm9yaWVudGF0aW9uID0gdXRpbF8xLm9wcG9zaXRlKHN0YXRlLm9yaWVudGF0aW9uKTtcbiAgICBzdGF0ZS5hbmltYXRpb24uY3VycmVudCA9IHN0YXRlLmRyYWdnYWJsZS5jdXJyZW50ID0gc3RhdGUuc2VsZWN0ZWQgPSB1bmRlZmluZWQ7XG59XG5leHBvcnRzLnRvZ2dsZU9yaWVudGF0aW9uID0gdG9nZ2xlT3JpZW50YXRpb247XG5mdW5jdGlvbiByZXNldChzdGF0ZSkge1xuICAgIHN0YXRlLmxhc3RNb3ZlID0gdW5kZWZpbmVkO1xuICAgIHVuc2VsZWN0KHN0YXRlKTtcbiAgICB1bnNldFByZW1vdmUoc3RhdGUpO1xuICAgIHVuc2V0UHJlZHJvcChzdGF0ZSk7XG59XG5leHBvcnRzLnJlc2V0ID0gcmVzZXQ7XG5mdW5jdGlvbiBzZXRQaWVjZXMoc3RhdGUsIHBpZWNlcykge1xuICAgIGZvciAoY29uc3QgW2tleSwgcGllY2VdIG9mIHBpZWNlcykge1xuICAgICAgICBpZiAocGllY2UpXG4gICAgICAgICAgICBzdGF0ZS5waWVjZXMuc2V0KGtleSwgcGllY2UpO1xuICAgICAgICBlbHNlXG4gICAgICAgICAgICBzdGF0ZS5waWVjZXMuZGVsZXRlKGtleSk7XG4gICAgfVxufVxuZXhwb3J0cy5zZXRQaWVjZXMgPSBzZXRQaWVjZXM7XG5mdW5jdGlvbiBzZXRDaGVjayhzdGF0ZSwgY29sb3IpIHtcbiAgICBzdGF0ZS5jaGVjayA9IHVuZGVmaW5lZDtcbiAgICBpZiAoY29sb3IgPT09IHRydWUpXG4gICAgICAgIGNvbG9yID0gc3RhdGUudHVybkNvbG9yO1xuICAgIGlmIChjb2xvcilcbiAgICAgICAgZm9yIChjb25zdCBbaywgcF0gb2Ygc3RhdGUucGllY2VzKSB7XG4gICAgICAgICAgICBpZiAocC5yb2xlID09PSAna2luZycgJiYgcC5jb2xvciA9PT0gY29sb3IpIHtcbiAgICAgICAgICAgICAgICBzdGF0ZS5jaGVjayA9IGs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbn1cbmV4cG9ydHMuc2V0Q2hlY2sgPSBzZXRDaGVjaztcbmZ1bmN0aW9uIHNldFByZW1vdmUoc3RhdGUsIG9yaWcsIGRlc3QsIG1ldGEpIHtcbiAgICB1bnNldFByZWRyb3Aoc3RhdGUpO1xuICAgIHN0YXRlLnByZW1vdmFibGUuY3VycmVudCA9IFtvcmlnLCBkZXN0XTtcbiAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLnByZW1vdmFibGUuZXZlbnRzLnNldCwgb3JpZywgZGVzdCwgbWV0YSk7XG59XG5mdW5jdGlvbiB1bnNldFByZW1vdmUoc3RhdGUpIHtcbiAgICBpZiAoc3RhdGUucHJlbW92YWJsZS5jdXJyZW50KSB7XG4gICAgICAgIHN0YXRlLnByZW1vdmFibGUuY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICAgICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5wcmVtb3ZhYmxlLmV2ZW50cy51bnNldCk7XG4gICAgfVxufVxuZXhwb3J0cy51bnNldFByZW1vdmUgPSB1bnNldFByZW1vdmU7XG5mdW5jdGlvbiBzZXRQcmVkcm9wKHN0YXRlLCByb2xlLCBrZXkpIHtcbiAgICB1bnNldFByZW1vdmUoc3RhdGUpO1xuICAgIHN0YXRlLnByZWRyb3BwYWJsZS5jdXJyZW50ID0geyByb2xlLCBrZXkgfTtcbiAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLnByZWRyb3BwYWJsZS5ldmVudHMuc2V0LCByb2xlLCBrZXkpO1xufVxuZnVuY3Rpb24gdW5zZXRQcmVkcm9wKHN0YXRlKSB7XG4gICAgY29uc3QgcGQgPSBzdGF0ZS5wcmVkcm9wcGFibGU7XG4gICAgaWYgKHBkLmN1cnJlbnQpIHtcbiAgICAgICAgcGQuY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICAgICAgY2FsbFVzZXJGdW5jdGlvbihwZC5ldmVudHMudW5zZXQpO1xuICAgIH1cbn1cbmV4cG9ydHMudW5zZXRQcmVkcm9wID0gdW5zZXRQcmVkcm9wO1xuZnVuY3Rpb24gdHJ5QXV0b0Nhc3RsZShzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIGlmICghc3RhdGUuYXV0b0Nhc3RsZSlcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGtpbmcgPSBzdGF0ZS5waWVjZXMuZ2V0KG9yaWcpO1xuICAgIGlmICgha2luZyB8fCBraW5nLnJvbGUgIT09ICdraW5nJylcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IG9yaWdQb3MgPSB1dGlsXzEua2V5MnBvcyhvcmlnKTtcbiAgICBjb25zdCBkZXN0UG9zID0gdXRpbF8xLmtleTJwb3MoZGVzdCk7XG4gICAgaWYgKChvcmlnUG9zWzFdICE9PSAwICYmIG9yaWdQb3NbMV0gIT09IDcpIHx8IG9yaWdQb3NbMV0gIT09IGRlc3RQb3NbMV0pXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICBpZiAob3JpZ1Bvc1swXSA9PT0gNCAmJiAhc3RhdGUucGllY2VzLmhhcyhkZXN0KSkge1xuICAgICAgICBpZiAoZGVzdFBvc1swXSA9PT0gNilcbiAgICAgICAgICAgIGRlc3QgPSB1dGlsXzEucG9zMmtleShbNywgZGVzdFBvc1sxXV0pO1xuICAgICAgICBlbHNlIGlmIChkZXN0UG9zWzBdID09PSAyKVxuICAgICAgICAgICAgZGVzdCA9IHV0aWxfMS5wb3Mya2V5KFswLCBkZXN0UG9zWzFdXSk7XG4gICAgfVxuICAgIGNvbnN0IHJvb2sgPSBzdGF0ZS5waWVjZXMuZ2V0KGRlc3QpO1xuICAgIGlmICghcm9vayB8fCByb29rLmNvbG9yICE9PSBraW5nLmNvbG9yIHx8IHJvb2sucm9sZSAhPT0gJ3Jvb2snKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgc3RhdGUucGllY2VzLmRlbGV0ZShvcmlnKTtcbiAgICBzdGF0ZS5waWVjZXMuZGVsZXRlKGRlc3QpO1xuICAgIGlmIChvcmlnUG9zWzBdIDwgZGVzdFBvc1swXSkge1xuICAgICAgICBzdGF0ZS5waWVjZXMuc2V0KHV0aWxfMS5wb3Mya2V5KFs2LCBkZXN0UG9zWzFdXSksIGtpbmcpO1xuICAgICAgICBzdGF0ZS5waWVjZXMuc2V0KHV0aWxfMS5wb3Mya2V5KFs1LCBkZXN0UG9zWzFdXSksIHJvb2spO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgc3RhdGUucGllY2VzLnNldCh1dGlsXzEucG9zMmtleShbMiwgZGVzdFBvc1sxXV0pLCBraW5nKTtcbiAgICAgICAgc3RhdGUucGllY2VzLnNldCh1dGlsXzEucG9zMmtleShbMywgZGVzdFBvc1sxXV0pLCByb29rKTtcbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG59XG5mdW5jdGlvbiBiYXNlTW92ZShzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIGNvbnN0IG9yaWdQaWVjZSA9IHN0YXRlLnBpZWNlcy5nZXQob3JpZyksIGRlc3RQaWVjZSA9IHN0YXRlLnBpZWNlcy5nZXQoZGVzdCk7XG4gICAgaWYgKG9yaWcgPT09IGRlc3QgfHwgIW9yaWdQaWVjZSlcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIGNvbnN0IGNhcHR1cmVkID0gZGVzdFBpZWNlICYmIGRlc3RQaWVjZS5jb2xvciAhPT0gb3JpZ1BpZWNlLmNvbG9yID8gZGVzdFBpZWNlIDogdW5kZWZpbmVkO1xuICAgIGlmIChkZXN0ID09PSBzdGF0ZS5zZWxlY3RlZClcbiAgICAgICAgdW5zZWxlY3Qoc3RhdGUpO1xuICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUuZXZlbnRzLm1vdmUsIG9yaWcsIGRlc3QsIGNhcHR1cmVkKTtcbiAgICBpZiAoIXRyeUF1dG9DYXN0bGUoc3RhdGUsIG9yaWcsIGRlc3QpKSB7XG4gICAgICAgIHN0YXRlLnBpZWNlcy5zZXQoZGVzdCwgb3JpZ1BpZWNlKTtcbiAgICAgICAgc3RhdGUucGllY2VzLmRlbGV0ZShvcmlnKTtcbiAgICB9XG4gICAgc3RhdGUubGFzdE1vdmUgPSBbb3JpZywgZGVzdF07XG4gICAgc3RhdGUuY2hlY2sgPSB1bmRlZmluZWQ7XG4gICAgY2FsbFVzZXJGdW5jdGlvbihzdGF0ZS5ldmVudHMuY2hhbmdlKTtcbiAgICByZXR1cm4gY2FwdHVyZWQgfHwgdHJ1ZTtcbn1cbmV4cG9ydHMuYmFzZU1vdmUgPSBiYXNlTW92ZTtcbmZ1bmN0aW9uIGJhc2VOZXdQaWVjZShzdGF0ZSwgcGllY2UsIGtleSwgZm9yY2UpIHtcbiAgICBpZiAoc3RhdGUucGllY2VzLmhhcyhrZXkpKSB7XG4gICAgICAgIGlmIChmb3JjZSlcbiAgICAgICAgICAgIHN0YXRlLnBpZWNlcy5kZWxldGUoa2V5KTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLmV2ZW50cy5kcm9wTmV3UGllY2UsIHBpZWNlLCBrZXkpO1xuICAgIHN0YXRlLnBpZWNlcy5zZXQoa2V5LCBwaWVjZSk7XG4gICAgc3RhdGUubGFzdE1vdmUgPSBba2V5XTtcbiAgICBzdGF0ZS5jaGVjayA9IHVuZGVmaW5lZDtcbiAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLmV2ZW50cy5jaGFuZ2UpO1xuICAgIHN0YXRlLm1vdmFibGUuZGVzdHMgPSB1bmRlZmluZWQ7XG4gICAgc3RhdGUudHVybkNvbG9yID0gdXRpbF8xLm9wcG9zaXRlKHN0YXRlLnR1cm5Db2xvcik7XG4gICAgcmV0dXJuIHRydWU7XG59XG5leHBvcnRzLmJhc2VOZXdQaWVjZSA9IGJhc2VOZXdQaWVjZTtcbmZ1bmN0aW9uIGJhc2VVc2VyTW92ZShzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGJhc2VNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KTtcbiAgICBpZiAocmVzdWx0KSB7XG4gICAgICAgIHN0YXRlLm1vdmFibGUuZGVzdHMgPSB1bmRlZmluZWQ7XG4gICAgICAgIHN0YXRlLnR1cm5Db2xvciA9IHV0aWxfMS5vcHBvc2l0ZShzdGF0ZS50dXJuQ29sb3IpO1xuICAgICAgICBzdGF0ZS5hbmltYXRpb24uY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cbmZ1bmN0aW9uIHVzZXJNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSB7XG4gICAgaWYgKGNhbk1vdmUoc3RhdGUsIG9yaWcsIGRlc3QpKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGJhc2VVc2VyTW92ZShzdGF0ZSwgb3JpZywgZGVzdCk7XG4gICAgICAgIGlmIChyZXN1bHQpIHtcbiAgICAgICAgICAgIGNvbnN0IGhvbGRUaW1lID0gc3RhdGUuaG9sZC5zdG9wKCk7XG4gICAgICAgICAgICB1bnNlbGVjdChzdGF0ZSk7XG4gICAgICAgICAgICBjb25zdCBtZXRhZGF0YSA9IHtcbiAgICAgICAgICAgICAgICBwcmVtb3ZlOiBmYWxzZSxcbiAgICAgICAgICAgICAgICBjdHJsS2V5OiBzdGF0ZS5zdGF0cy5jdHJsS2V5LFxuICAgICAgICAgICAgICAgIGhvbGRUaW1lLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQgIT09IHRydWUpXG4gICAgICAgICAgICAgICAgbWV0YWRhdGEuY2FwdHVyZWQgPSByZXN1bHQ7XG4gICAgICAgICAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLm1vdmFibGUuZXZlbnRzLmFmdGVyLCBvcmlnLCBkZXN0LCBtZXRhZGF0YSk7XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBlbHNlIGlmIChjYW5QcmVtb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSkge1xuICAgICAgICBzZXRQcmVtb3ZlKHN0YXRlLCBvcmlnLCBkZXN0LCB7XG4gICAgICAgICAgICBjdHJsS2V5OiBzdGF0ZS5zdGF0cy5jdHJsS2V5LFxuICAgICAgICB9KTtcbiAgICAgICAgdW5zZWxlY3Qoc3RhdGUpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgdW5zZWxlY3Qoc3RhdGUpO1xuICAgIHJldHVybiBmYWxzZTtcbn1cbmV4cG9ydHMudXNlck1vdmUgPSB1c2VyTW92ZTtcbmZ1bmN0aW9uIGRyb3BOZXdQaWVjZShzdGF0ZSwgb3JpZywgZGVzdCwgZm9yY2UpIHtcbiAgICBjb25zdCBwaWVjZSA9IHN0YXRlLnBpZWNlcy5nZXQob3JpZyk7XG4gICAgaWYgKHBpZWNlICYmIChjYW5Ecm9wKHN0YXRlLCBvcmlnLCBkZXN0KSB8fCBmb3JjZSkpIHtcbiAgICAgICAgc3RhdGUucGllY2VzLmRlbGV0ZShvcmlnKTtcbiAgICAgICAgYmFzZU5ld1BpZWNlKHN0YXRlLCBwaWVjZSwgZGVzdCwgZm9yY2UpO1xuICAgICAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLm1vdmFibGUuZXZlbnRzLmFmdGVyTmV3UGllY2UsIHBpZWNlLnJvbGUsIGRlc3QsIHtcbiAgICAgICAgICAgIHByZW1vdmU6IGZhbHNlLFxuICAgICAgICAgICAgcHJlZHJvcDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgIH1cbiAgICBlbHNlIGlmIChwaWVjZSAmJiBjYW5QcmVkcm9wKHN0YXRlLCBvcmlnLCBkZXN0KSkge1xuICAgICAgICBzZXRQcmVkcm9wKHN0YXRlLCBwaWVjZS5yb2xlLCBkZXN0KTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHVuc2V0UHJlbW92ZShzdGF0ZSk7XG4gICAgICAgIHVuc2V0UHJlZHJvcChzdGF0ZSk7XG4gICAgfVxuICAgIHN0YXRlLnBpZWNlcy5kZWxldGUob3JpZyk7XG4gICAgdW5zZWxlY3Qoc3RhdGUpO1xufVxuZXhwb3J0cy5kcm9wTmV3UGllY2UgPSBkcm9wTmV3UGllY2U7XG5mdW5jdGlvbiBzZWxlY3RTcXVhcmUoc3RhdGUsIGtleSwgZm9yY2UpIHtcbiAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLmV2ZW50cy5zZWxlY3QsIGtleSk7XG4gICAgaWYgKHN0YXRlLnNlbGVjdGVkKSB7XG4gICAgICAgIGlmIChzdGF0ZS5zZWxlY3RlZCA9PT0ga2V5ICYmICFzdGF0ZS5kcmFnZ2FibGUuZW5hYmxlZCkge1xuICAgICAgICAgICAgdW5zZWxlY3Qoc3RhdGUpO1xuICAgICAgICAgICAgc3RhdGUuaG9sZC5jYW5jZWwoKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIGlmICgoc3RhdGUuc2VsZWN0YWJsZS5lbmFibGVkIHx8IGZvcmNlKSAmJiBzdGF0ZS5zZWxlY3RlZCAhPT0ga2V5KSB7XG4gICAgICAgICAgICBpZiAodXNlck1vdmUoc3RhdGUsIHN0YXRlLnNlbGVjdGVkLCBrZXkpKSB7XG4gICAgICAgICAgICAgICAgc3RhdGUuc3RhdHMuZHJhZ2dlZCA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoaXNNb3ZhYmxlKHN0YXRlLCBrZXkpIHx8IGlzUHJlbW92YWJsZShzdGF0ZSwga2V5KSkge1xuICAgICAgICBzZXRTZWxlY3RlZChzdGF0ZSwga2V5KTtcbiAgICAgICAgc3RhdGUuaG9sZC5zdGFydCgpO1xuICAgIH1cbn1cbmV4cG9ydHMuc2VsZWN0U3F1YXJlID0gc2VsZWN0U3F1YXJlO1xuZnVuY3Rpb24gc2V0U2VsZWN0ZWQoc3RhdGUsIGtleSkge1xuICAgIHN0YXRlLnNlbGVjdGVkID0ga2V5O1xuICAgIGlmIChpc1ByZW1vdmFibGUoc3RhdGUsIGtleSkpIHtcbiAgICAgICAgc3RhdGUucHJlbW92YWJsZS5kZXN0cyA9IHByZW1vdmVfMS5wcmVtb3ZlKHN0YXRlLnBpZWNlcywga2V5LCBzdGF0ZS5wcmVtb3ZhYmxlLmNhc3RsZSk7XG4gICAgfVxuICAgIGVsc2VcbiAgICAgICAgc3RhdGUucHJlbW92YWJsZS5kZXN0cyA9IHVuZGVmaW5lZDtcbn1cbmV4cG9ydHMuc2V0U2VsZWN0ZWQgPSBzZXRTZWxlY3RlZDtcbmZ1bmN0aW9uIHVuc2VsZWN0KHN0YXRlKSB7XG4gICAgc3RhdGUuc2VsZWN0ZWQgPSB1bmRlZmluZWQ7XG4gICAgc3RhdGUucHJlbW92YWJsZS5kZXN0cyA9IHVuZGVmaW5lZDtcbiAgICBzdGF0ZS5ob2xkLmNhbmNlbCgpO1xufVxuZXhwb3J0cy51bnNlbGVjdCA9IHVuc2VsZWN0O1xuZnVuY3Rpb24gaXNNb3ZhYmxlKHN0YXRlLCBvcmlnKSB7XG4gICAgY29uc3QgcGllY2UgPSBzdGF0ZS5waWVjZXMuZ2V0KG9yaWcpO1xuICAgIHJldHVybiAoISFwaWVjZSAmJlxuICAgICAgICAoc3RhdGUubW92YWJsZS5jb2xvciA9PT0gJ2JvdGgnIHx8IChzdGF0ZS5tb3ZhYmxlLmNvbG9yID09PSBwaWVjZS5jb2xvciAmJiBzdGF0ZS50dXJuQ29sb3IgPT09IHBpZWNlLmNvbG9yKSkpO1xufVxuZnVuY3Rpb24gY2FuTW92ZShzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIHZhciBfYSwgX2I7XG4gICAgcmV0dXJuIChvcmlnICE9PSBkZXN0ICYmIGlzTW92YWJsZShzdGF0ZSwgb3JpZykgJiYgKHN0YXRlLm1vdmFibGUuZnJlZSB8fCAhISgoX2IgPSAoX2EgPSBzdGF0ZS5tb3ZhYmxlLmRlc3RzKSA9PT0gbnVsbCB8fCBfYSA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2EuZ2V0KG9yaWcpKSA9PT0gbnVsbCB8fCBfYiA9PT0gdm9pZCAwID8gdm9pZCAwIDogX2IuaW5jbHVkZXMoZGVzdCkpKSk7XG59XG5leHBvcnRzLmNhbk1vdmUgPSBjYW5Nb3ZlO1xuZnVuY3Rpb24gY2FuRHJvcChzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIGNvbnN0IHBpZWNlID0gc3RhdGUucGllY2VzLmdldChvcmlnKTtcbiAgICByZXR1cm4gKCEhcGllY2UgJiZcbiAgICAgICAgKG9yaWcgPT09IGRlc3QgfHwgIXN0YXRlLnBpZWNlcy5oYXMoZGVzdCkpICYmXG4gICAgICAgIChzdGF0ZS5tb3ZhYmxlLmNvbG9yID09PSAnYm90aCcgfHwgKHN0YXRlLm1vdmFibGUuY29sb3IgPT09IHBpZWNlLmNvbG9yICYmIHN0YXRlLnR1cm5Db2xvciA9PT0gcGllY2UuY29sb3IpKSk7XG59XG5mdW5jdGlvbiBpc1ByZW1vdmFibGUoc3RhdGUsIG9yaWcpIHtcbiAgICBjb25zdCBwaWVjZSA9IHN0YXRlLnBpZWNlcy5nZXQob3JpZyk7XG4gICAgcmV0dXJuICEhcGllY2UgJiYgc3RhdGUucHJlbW92YWJsZS5lbmFibGVkICYmIHN0YXRlLm1vdmFibGUuY29sb3IgPT09IHBpZWNlLmNvbG9yICYmIHN0YXRlLnR1cm5Db2xvciAhPT0gcGllY2UuY29sb3I7XG59XG5mdW5jdGlvbiBjYW5QcmVtb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KSB7XG4gICAgcmV0dXJuIChvcmlnICE9PSBkZXN0ICYmIGlzUHJlbW92YWJsZShzdGF0ZSwgb3JpZykgJiYgcHJlbW92ZV8xLnByZW1vdmUoc3RhdGUucGllY2VzLCBvcmlnLCBzdGF0ZS5wcmVtb3ZhYmxlLmNhc3RsZSkuaW5jbHVkZXMoZGVzdCkpO1xufVxuZnVuY3Rpb24gY2FuUHJlZHJvcChzdGF0ZSwgb3JpZywgZGVzdCkge1xuICAgIGNvbnN0IHBpZWNlID0gc3RhdGUucGllY2VzLmdldChvcmlnKTtcbiAgICBjb25zdCBkZXN0UGllY2UgPSBzdGF0ZS5waWVjZXMuZ2V0KGRlc3QpO1xuICAgIHJldHVybiAoISFwaWVjZSAmJlxuICAgICAgICAoIWRlc3RQaWVjZSB8fCBkZXN0UGllY2UuY29sb3IgIT09IHN0YXRlLm1vdmFibGUuY29sb3IpICYmXG4gICAgICAgIHN0YXRlLnByZWRyb3BwYWJsZS5lbmFibGVkICYmXG4gICAgICAgIChwaWVjZS5yb2xlICE9PSAncGF3bicgfHwgKGRlc3RbMV0gIT09ICcxJyAmJiBkZXN0WzFdICE9PSAnOCcpKSAmJlxuICAgICAgICBzdGF0ZS5tb3ZhYmxlLmNvbG9yID09PSBwaWVjZS5jb2xvciAmJlxuICAgICAgICBzdGF0ZS50dXJuQ29sb3IgIT09IHBpZWNlLmNvbG9yKTtcbn1cbmZ1bmN0aW9uIGlzRHJhZ2dhYmxlKHN0YXRlLCBvcmlnKSB7XG4gICAgY29uc3QgcGllY2UgPSBzdGF0ZS5waWVjZXMuZ2V0KG9yaWcpO1xuICAgIHJldHVybiAoISFwaWVjZSAmJlxuICAgICAgICBzdGF0ZS5kcmFnZ2FibGUuZW5hYmxlZCAmJlxuICAgICAgICAoc3RhdGUubW92YWJsZS5jb2xvciA9PT0gJ2JvdGgnIHx8XG4gICAgICAgICAgICAoc3RhdGUubW92YWJsZS5jb2xvciA9PT0gcGllY2UuY29sb3IgJiYgKHN0YXRlLnR1cm5Db2xvciA9PT0gcGllY2UuY29sb3IgfHwgc3RhdGUucHJlbW92YWJsZS5lbmFibGVkKSkpKTtcbn1cbmV4cG9ydHMuaXNEcmFnZ2FibGUgPSBpc0RyYWdnYWJsZTtcbmZ1bmN0aW9uIHBsYXlQcmVtb3ZlKHN0YXRlKSB7XG4gICAgY29uc3QgbW92ZSA9IHN0YXRlLnByZW1vdmFibGUuY3VycmVudDtcbiAgICBpZiAoIW1vdmUpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICBjb25zdCBvcmlnID0gbW92ZVswXSwgZGVzdCA9IG1vdmVbMV07XG4gICAgbGV0IHN1Y2Nlc3MgPSBmYWxzZTtcbiAgICBpZiAoY2FuTW92ZShzdGF0ZSwgb3JpZywgZGVzdCkpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYmFzZVVzZXJNb3ZlKHN0YXRlLCBvcmlnLCBkZXN0KTtcbiAgICAgICAgaWYgKHJlc3VsdCkge1xuICAgICAgICAgICAgY29uc3QgbWV0YWRhdGEgPSB7IHByZW1vdmU6IHRydWUgfTtcbiAgICAgICAgICAgIGlmIChyZXN1bHQgIT09IHRydWUpXG4gICAgICAgICAgICAgICAgbWV0YWRhdGEuY2FwdHVyZWQgPSByZXN1bHQ7XG4gICAgICAgICAgICBjYWxsVXNlckZ1bmN0aW9uKHN0YXRlLm1vdmFibGUuZXZlbnRzLmFmdGVyLCBvcmlnLCBkZXN0LCBtZXRhZGF0YSk7XG4gICAgICAgICAgICBzdWNjZXNzID0gdHJ1ZTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB1bnNldFByZW1vdmUoc3RhdGUpO1xuICAgIHJldHVybiBzdWNjZXNzO1xufVxuZXhwb3J0cy5wbGF5UHJlbW92ZSA9IHBsYXlQcmVtb3ZlO1xuZnVuY3Rpb24gcGxheVByZWRyb3Aoc3RhdGUsIHZhbGlkYXRlKSB7XG4gICAgY29uc3QgZHJvcCA9IHN0YXRlLnByZWRyb3BwYWJsZS5jdXJyZW50O1xuICAgIGxldCBzdWNjZXNzID0gZmFsc2U7XG4gICAgaWYgKCFkcm9wKVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgaWYgKHZhbGlkYXRlKGRyb3ApKSB7XG4gICAgICAgIGNvbnN0IHBpZWNlID0ge1xuICAgICAgICAgICAgcm9sZTogZHJvcC5yb2xlLFxuICAgICAgICAgICAgY29sb3I6IHN0YXRlLm1vdmFibGUuY29sb3IsXG4gICAgICAgIH07XG4gICAgICAgIGlmIChiYXNlTmV3UGllY2Uoc3RhdGUsIHBpZWNlLCBkcm9wLmtleSkpIHtcbiAgICAgICAgICAgIGNhbGxVc2VyRnVuY3Rpb24oc3RhdGUubW92YWJsZS5ldmVudHMuYWZ0ZXJOZXdQaWVjZSwgZHJvcC5yb2xlLCBkcm9wLmtleSwge1xuICAgICAgICAgICAgICAgIHByZW1vdmU6IGZhbHNlLFxuICAgICAgICAgICAgICAgIHByZWRyb3A6IHRydWUsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHN1Y2Nlc3MgPSB0cnVlO1xuICAgICAgICB9XG4gICAgfVxuICAgIHVuc2V0UHJlZHJvcChzdGF0ZSk7XG4gICAgcmV0dXJuIHN1Y2Nlc3M7XG59XG5leHBvcnRzLnBsYXlQcmVkcm9wID0gcGxheVByZWRyb3A7XG5mdW5jdGlvbiBjYW5jZWxNb3ZlKHN0YXRlKSB7XG4gICAgdW5zZXRQcmVtb3ZlKHN0YXRlKTtcbiAgICB1bnNldFByZWRyb3Aoc3RhdGUpO1xuICAgIHVuc2VsZWN0KHN0YXRlKTtcbn1cbmV4cG9ydHMuY2FuY2VsTW92ZSA9IGNhbmNlbE1vdmU7XG5mdW5jdGlvbiBzdG9wKHN0YXRlKSB7XG4gICAgc3RhdGUubW92YWJsZS5jb2xvciA9IHN0YXRlLm1vdmFibGUuZGVzdHMgPSBzdGF0ZS5hbmltYXRpb24uY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICBjYW5jZWxNb3ZlKHN0YXRlKTtcbn1cbmV4cG9ydHMuc3RvcCA9IHN0b3A7XG5mdW5jdGlvbiBnZXRLZXlBdERvbVBvcyhwb3MsIGFzV2hpdGUsIGJvdW5kcykge1xuICAgIGxldCBmaWxlID0gTWF0aC5mbG9vcigoOCAqIChwb3NbMF0gLSBib3VuZHMubGVmdCkpIC8gYm91bmRzLndpZHRoKTtcbiAgICBpZiAoIWFzV2hpdGUpXG4gICAgICAgIGZpbGUgPSA3IC0gZmlsZTtcbiAgICBsZXQgcmFuayA9IDcgLSBNYXRoLmZsb29yKCg4ICogKHBvc1sxXSAtIGJvdW5kcy50b3ApKSAvIGJvdW5kcy5oZWlnaHQpO1xuICAgIGlmICghYXNXaGl0ZSlcbiAgICAgICAgcmFuayA9IDcgLSByYW5rO1xuICAgIHJldHVybiBmaWxlID49IDAgJiYgZmlsZSA8IDggJiYgcmFuayA+PSAwICYmIHJhbmsgPCA4ID8gdXRpbF8xLnBvczJrZXkoW2ZpbGUsIHJhbmtdKSA6IHVuZGVmaW5lZDtcbn1cbmV4cG9ydHMuZ2V0S2V5QXREb21Qb3MgPSBnZXRLZXlBdERvbVBvcztcbmZ1bmN0aW9uIGdldFNuYXBwZWRLZXlBdERvbVBvcyhvcmlnLCBwb3MsIGFzV2hpdGUsIGJvdW5kcykge1xuICAgIGNvbnN0IG9yaWdQb3MgPSB1dGlsXzEua2V5MnBvcyhvcmlnKTtcbiAgICBjb25zdCB2YWxpZFNuYXBQb3MgPSB1dGlsXzEuYWxsUG9zLmZpbHRlcihwb3MyID0+IHtcbiAgICAgICAgcmV0dXJuIHByZW1vdmVfMS5xdWVlbihvcmlnUG9zWzBdLCBvcmlnUG9zWzFdLCBwb3MyWzBdLCBwb3MyWzFdKSB8fCBwcmVtb3ZlXzEua25pZ2h0KG9yaWdQb3NbMF0sIG9yaWdQb3NbMV0sIHBvczJbMF0sIHBvczJbMV0pO1xuICAgIH0pO1xuICAgIGNvbnN0IHZhbGlkU25hcENlbnRlcnMgPSB2YWxpZFNuYXBQb3MubWFwKHBvczIgPT4gdXRpbF8xLmNvbXB1dGVTcXVhcmVDZW50ZXIodXRpbF8xLnBvczJrZXkocG9zMiksIGFzV2hpdGUsIGJvdW5kcykpO1xuICAgIGNvbnN0IHZhbGlkU25hcERpc3RhbmNlcyA9IHZhbGlkU25hcENlbnRlcnMubWFwKHBvczIgPT4gdXRpbF8xLmRpc3RhbmNlU3EocG9zLCBwb3MyKSk7XG4gICAgY29uc3QgWywgY2xvc2VzdFNuYXBJbmRleF0gPSB2YWxpZFNuYXBEaXN0YW5jZXMucmVkdWNlKChhLCBiLCBpbmRleCkgPT4gKGFbMF0gPCBiID8gYSA6IFtiLCBpbmRleF0pLCBbXG4gICAgICAgIHZhbGlkU25hcERpc3RhbmNlc1swXSxcbiAgICAgICAgMCxcbiAgICBdKTtcbiAgICByZXR1cm4gdXRpbF8xLnBvczJrZXkodmFsaWRTbmFwUG9zW2Nsb3Nlc3RTbmFwSW5kZXhdKTtcbn1cbmV4cG9ydHMuZ2V0U25hcHBlZEtleUF0RG9tUG9zID0gZ2V0U25hcHBlZEtleUF0RG9tUG9zO1xuZnVuY3Rpb24gd2hpdGVQb3Yocykge1xuICAgIHJldHVybiBzLm9yaWVudGF0aW9uID09PSAnd2hpdGUnO1xufVxuZXhwb3J0cy53aGl0ZVBvdiA9IHdoaXRlUG92O1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9Ym9hcmQuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5leHBvcnRzLkNoZXNzZ3JvdW5kID0gdm9pZCAwO1xuY29uc3QgYXBpXzEgPSByZXF1aXJlKFwiLi9hcGlcIik7XG5jb25zdCBjb25maWdfMSA9IHJlcXVpcmUoXCIuL2NvbmZpZ1wiKTtcbmNvbnN0IHN0YXRlXzEgPSByZXF1aXJlKFwiLi9zdGF0ZVwiKTtcbmNvbnN0IHdyYXBfMSA9IHJlcXVpcmUoXCIuL3dyYXBcIik7XG5jb25zdCBldmVudHMgPSByZXF1aXJlKFwiLi9ldmVudHNcIik7XG5jb25zdCByZW5kZXJfMSA9IHJlcXVpcmUoXCIuL3JlbmRlclwiKTtcbmNvbnN0IHN2ZyA9IHJlcXVpcmUoXCIuL3N2Z1wiKTtcbmNvbnN0IHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuZnVuY3Rpb24gQ2hlc3Nncm91bmQoZWxlbWVudCwgY29uZmlnKSB7XG4gICAgY29uc3QgbWF5YmVTdGF0ZSA9IHN0YXRlXzEuZGVmYXVsdHMoKTtcbiAgICBjb25maWdfMS5jb25maWd1cmUobWF5YmVTdGF0ZSwgY29uZmlnIHx8IHt9KTtcbiAgICBmdW5jdGlvbiByZWRyYXdBbGwoKSB7XG4gICAgICAgIGNvbnN0IHByZXZVbmJpbmQgPSAnZG9tJyBpbiBtYXliZVN0YXRlID8gbWF5YmVTdGF0ZS5kb20udW5iaW5kIDogdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCByZWxhdGl2ZSA9IG1heWJlU3RhdGUudmlld09ubHkgJiYgIW1heWJlU3RhdGUuZHJhd2FibGUudmlzaWJsZSwgZWxlbWVudHMgPSB3cmFwXzEucmVuZGVyV3JhcChlbGVtZW50LCBtYXliZVN0YXRlLCByZWxhdGl2ZSksIGJvdW5kcyA9IHV0aWwubWVtbygoKSA9PiBlbGVtZW50cy5ib2FyZC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSksIHJlZHJhd05vdyA9IChza2lwU3ZnKSA9PiB7XG4gICAgICAgICAgICByZW5kZXJfMS5yZW5kZXIoc3RhdGUpO1xuICAgICAgICAgICAgaWYgKCFza2lwU3ZnICYmIGVsZW1lbnRzLnN2ZylcbiAgICAgICAgICAgICAgICBzdmcucmVuZGVyU3ZnKHN0YXRlLCBlbGVtZW50cy5zdmcsIGVsZW1lbnRzLmN1c3RvbVN2Zyk7XG4gICAgICAgIH0sIGJvdW5kc1VwZGF0ZWQgPSAoKSA9PiB7XG4gICAgICAgICAgICBib3VuZHMuY2xlYXIoKTtcbiAgICAgICAgICAgIHJlbmRlcl8xLnVwZGF0ZUJvdW5kcyhzdGF0ZSk7XG4gICAgICAgICAgICBpZiAoZWxlbWVudHMuc3ZnKVxuICAgICAgICAgICAgICAgIHN2Zy5yZW5kZXJTdmcoc3RhdGUsIGVsZW1lbnRzLnN2ZywgZWxlbWVudHMuY3VzdG9tU3ZnKTtcbiAgICAgICAgfTtcbiAgICAgICAgY29uc3Qgc3RhdGUgPSBtYXliZVN0YXRlO1xuICAgICAgICBzdGF0ZS5kb20gPSB7XG4gICAgICAgICAgICBlbGVtZW50cyxcbiAgICAgICAgICAgIGJvdW5kcyxcbiAgICAgICAgICAgIHJlZHJhdzogZGVib3VuY2VSZWRyYXcocmVkcmF3Tm93KSxcbiAgICAgICAgICAgIHJlZHJhd05vdyxcbiAgICAgICAgICAgIHVuYmluZDogcHJldlVuYmluZCxcbiAgICAgICAgICAgIHJlbGF0aXZlLFxuICAgICAgICB9O1xuICAgICAgICBzdGF0ZS5kcmF3YWJsZS5wcmV2U3ZnSGFzaCA9ICcnO1xuICAgICAgICByZWRyYXdOb3coZmFsc2UpO1xuICAgICAgICBldmVudHMuYmluZEJvYXJkKHN0YXRlLCBib3VuZHNVcGRhdGVkKTtcbiAgICAgICAgaWYgKCFwcmV2VW5iaW5kKVxuICAgICAgICAgICAgc3RhdGUuZG9tLnVuYmluZCA9IGV2ZW50cy5iaW5kRG9jdW1lbnQoc3RhdGUsIGJvdW5kc1VwZGF0ZWQpO1xuICAgICAgICBzdGF0ZS5ldmVudHMuaW5zZXJ0ICYmIHN0YXRlLmV2ZW50cy5pbnNlcnQoZWxlbWVudHMpO1xuICAgICAgICByZXR1cm4gc3RhdGU7XG4gICAgfVxuICAgIHJldHVybiBhcGlfMS5zdGFydChyZWRyYXdBbGwoKSwgcmVkcmF3QWxsKTtcbn1cbmV4cG9ydHMuQ2hlc3Nncm91bmQgPSBDaGVzc2dyb3VuZDtcbmZ1bmN0aW9uIGRlYm91bmNlUmVkcmF3KHJlZHJhd05vdykge1xuICAgIGxldCByZWRyYXdpbmcgPSBmYWxzZTtcbiAgICByZXR1cm4gKCkgPT4ge1xuICAgICAgICBpZiAocmVkcmF3aW5nKVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICByZWRyYXdpbmcgPSB0cnVlO1xuICAgICAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoKCkgPT4ge1xuICAgICAgICAgICAgcmVkcmF3Tm93KCk7XG4gICAgICAgICAgICByZWRyYXdpbmcgPSBmYWxzZTtcbiAgICAgICAgfSk7XG4gICAgfTtcbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWNoZXNzZ3JvdW5kLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuZXhwb3J0cy5jb25maWd1cmUgPSB2b2lkIDA7XG5jb25zdCBib2FyZF8xID0gcmVxdWlyZShcIi4vYm9hcmRcIik7XG5jb25zdCBmZW5fMSA9IHJlcXVpcmUoXCIuL2ZlblwiKTtcbmZ1bmN0aW9uIGNvbmZpZ3VyZShzdGF0ZSwgY29uZmlnKSB7XG4gICAgdmFyIF9hO1xuICAgIGlmICgoX2EgPSBjb25maWcubW92YWJsZSkgPT09IG51bGwgfHwgX2EgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9hLmRlc3RzKVxuICAgICAgICBzdGF0ZS5tb3ZhYmxlLmRlc3RzID0gdW5kZWZpbmVkO1xuICAgIG1lcmdlKHN0YXRlLCBjb25maWcpO1xuICAgIGlmIChjb25maWcuZmVuKSB7XG4gICAgICAgIHN0YXRlLnBpZWNlcyA9IGZlbl8xLnJlYWQoY29uZmlnLmZlbik7XG4gICAgICAgIHN0YXRlLmRyYXdhYmxlLnNoYXBlcyA9IFtdO1xuICAgIH1cbiAgICBpZiAoY29uZmlnLmhhc093blByb3BlcnR5KCdjaGVjaycpKVxuICAgICAgICBib2FyZF8xLnNldENoZWNrKHN0YXRlLCBjb25maWcuY2hlY2sgfHwgZmFsc2UpO1xuICAgIGlmIChjb25maWcuaGFzT3duUHJvcGVydHkoJ2xhc3RNb3ZlJykgJiYgIWNvbmZpZy5sYXN0TW92ZSlcbiAgICAgICAgc3RhdGUubGFzdE1vdmUgPSB1bmRlZmluZWQ7XG4gICAgZWxzZSBpZiAoY29uZmlnLmxhc3RNb3ZlKVxuICAgICAgICBzdGF0ZS5sYXN0TW92ZSA9IGNvbmZpZy5sYXN0TW92ZTtcbiAgICBpZiAoc3RhdGUuc2VsZWN0ZWQpXG4gICAgICAgIGJvYXJkXzEuc2V0U2VsZWN0ZWQoc3RhdGUsIHN0YXRlLnNlbGVjdGVkKTtcbiAgICBpZiAoIXN0YXRlLmFuaW1hdGlvbi5kdXJhdGlvbiB8fCBzdGF0ZS5hbmltYXRpb24uZHVyYXRpb24gPCAxMDApXG4gICAgICAgIHN0YXRlLmFuaW1hdGlvbi5lbmFibGVkID0gZmFsc2U7XG4gICAgaWYgKCFzdGF0ZS5tb3ZhYmxlLnJvb2tDYXN0bGUgJiYgc3RhdGUubW92YWJsZS5kZXN0cykge1xuICAgICAgICBjb25zdCByYW5rID0gc3RhdGUubW92YWJsZS5jb2xvciA9PT0gJ3doaXRlJyA/ICcxJyA6ICc4Jywga2luZ1N0YXJ0UG9zID0gKCdlJyArIHJhbmspLCBkZXN0cyA9IHN0YXRlLm1vdmFibGUuZGVzdHMuZ2V0KGtpbmdTdGFydFBvcyksIGtpbmcgPSBzdGF0ZS5waWVjZXMuZ2V0KGtpbmdTdGFydFBvcyk7XG4gICAgICAgIGlmICghZGVzdHMgfHwgIWtpbmcgfHwga2luZy5yb2xlICE9PSAna2luZycpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIHN0YXRlLm1vdmFibGUuZGVzdHMuc2V0KGtpbmdTdGFydFBvcywgZGVzdHMuZmlsdGVyKGQgPT4gIShkID09PSAnYScgKyByYW5rICYmIGRlc3RzLmluY2x1ZGVzKCgnYycgKyByYW5rKSkpICYmXG4gICAgICAgICAgICAhKGQgPT09ICdoJyArIHJhbmsgJiYgZGVzdHMuaW5jbHVkZXMoKCdnJyArIHJhbmspKSkpKTtcbiAgICB9XG59XG5leHBvcnRzLmNvbmZpZ3VyZSA9IGNvbmZpZ3VyZTtcbmZ1bmN0aW9uIG1lcmdlKGJhc2UsIGV4dGVuZCkge1xuICAgIGZvciAoY29uc3Qga2V5IGluIGV4dGVuZCkge1xuICAgICAgICBpZiAoaXNPYmplY3QoYmFzZVtrZXldKSAmJiBpc09iamVjdChleHRlbmRba2V5XSkpXG4gICAgICAgICAgICBtZXJnZShiYXNlW2tleV0sIGV4dGVuZFtrZXldKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgYmFzZVtrZXldID0gZXh0ZW5kW2tleV07XG4gICAgfVxufVxuZnVuY3Rpb24gaXNPYmplY3Qobykge1xuICAgIHJldHVybiB0eXBlb2YgbyA9PT0gJ29iamVjdCc7XG59XG4vLyMgc291cmNlTWFwcGluZ1VSTD1jb25maWcuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5leHBvcnRzLmNhbmNlbCA9IGV4cG9ydHMuZW5kID0gZXhwb3J0cy5tb3ZlID0gZXhwb3J0cy5kcmFnTmV3UGllY2UgPSBleHBvcnRzLnN0YXJ0ID0gdm9pZCAwO1xuY29uc3QgYm9hcmQgPSByZXF1aXJlKFwiLi9ib2FyZFwiKTtcbmNvbnN0IHV0aWwgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuY29uc3QgZHJhd18xID0gcmVxdWlyZShcIi4vZHJhd1wiKTtcbmNvbnN0IGFuaW1fMSA9IHJlcXVpcmUoXCIuL2FuaW1cIik7XG5mdW5jdGlvbiBzdGFydChzLCBlKSB7XG4gICAgaWYgKCFlLmlzVHJ1c3RlZCB8fCAoZS5idXR0b24gIT09IHVuZGVmaW5lZCAmJiBlLmJ1dHRvbiAhPT0gMCkpXG4gICAgICAgIHJldHVybjtcbiAgICBpZiAoZS50b3VjaGVzICYmIGUudG91Y2hlcy5sZW5ndGggPiAxKVxuICAgICAgICByZXR1cm47XG4gICAgY29uc3QgYm91bmRzID0gcy5kb20uYm91bmRzKCksIHBvc2l0aW9uID0gdXRpbC5ldmVudFBvc2l0aW9uKGUpLCBvcmlnID0gYm9hcmQuZ2V0S2V5QXREb21Qb3MocG9zaXRpb24sIGJvYXJkLndoaXRlUG92KHMpLCBib3VuZHMpO1xuICAgIGlmICghb3JpZylcbiAgICAgICAgcmV0dXJuO1xuICAgIGNvbnN0IHBpZWNlID0gcy5waWVjZXMuZ2V0KG9yaWcpO1xuICAgIGNvbnN0IHByZXZpb3VzbHlTZWxlY3RlZCA9IHMuc2VsZWN0ZWQ7XG4gICAgaWYgKCFwcmV2aW91c2x5U2VsZWN0ZWQgJiYgcy5kcmF3YWJsZS5lbmFibGVkICYmIChzLmRyYXdhYmxlLmVyYXNlT25DbGljayB8fCAhcGllY2UgfHwgcGllY2UuY29sb3IgIT09IHMudHVybkNvbG9yKSlcbiAgICAgICAgZHJhd18xLmNsZWFyKHMpO1xuICAgIGlmIChlLmNhbmNlbGFibGUgIT09IGZhbHNlICYmXG4gICAgICAgICghZS50b3VjaGVzIHx8ICFzLm1vdmFibGUuY29sb3IgfHwgcGllY2UgfHwgcHJldmlvdXNseVNlbGVjdGVkIHx8IHBpZWNlQ2xvc2VUbyhzLCBwb3NpdGlvbikpKVxuICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgY29uc3QgaGFkUHJlbW92ZSA9ICEhcy5wcmVtb3ZhYmxlLmN1cnJlbnQ7XG4gICAgY29uc3QgaGFkUHJlZHJvcCA9ICEhcy5wcmVkcm9wcGFibGUuY3VycmVudDtcbiAgICBzLnN0YXRzLmN0cmxLZXkgPSBlLmN0cmxLZXk7XG4gICAgaWYgKHMuc2VsZWN0ZWQgJiYgYm9hcmQuY2FuTW92ZShzLCBzLnNlbGVjdGVkLCBvcmlnKSkge1xuICAgICAgICBhbmltXzEuYW5pbShzdGF0ZSA9PiBib2FyZC5zZWxlY3RTcXVhcmUoc3RhdGUsIG9yaWcpLCBzKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGJvYXJkLnNlbGVjdFNxdWFyZShzLCBvcmlnKTtcbiAgICB9XG4gICAgY29uc3Qgc3RpbGxTZWxlY3RlZCA9IHMuc2VsZWN0ZWQgPT09IG9yaWc7XG4gICAgY29uc3QgZWxlbWVudCA9IHBpZWNlRWxlbWVudEJ5S2V5KHMsIG9yaWcpO1xuICAgIGlmIChwaWVjZSAmJiBlbGVtZW50ICYmIHN0aWxsU2VsZWN0ZWQgJiYgYm9hcmQuaXNEcmFnZ2FibGUocywgb3JpZykpIHtcbiAgICAgICAgcy5kcmFnZ2FibGUuY3VycmVudCA9IHtcbiAgICAgICAgICAgIG9yaWcsXG4gICAgICAgICAgICBwaWVjZSxcbiAgICAgICAgICAgIG9yaWdQb3M6IHBvc2l0aW9uLFxuICAgICAgICAgICAgcG9zOiBwb3NpdGlvbixcbiAgICAgICAgICAgIHN0YXJ0ZWQ6IHMuZHJhZ2dhYmxlLmF1dG9EaXN0YW5jZSAmJiBzLnN0YXRzLmRyYWdnZWQsXG4gICAgICAgICAgICBlbGVtZW50LFxuICAgICAgICAgICAgcHJldmlvdXNseVNlbGVjdGVkLFxuICAgICAgICAgICAgb3JpZ2luVGFyZ2V0OiBlLnRhcmdldCxcbiAgICAgICAgfTtcbiAgICAgICAgZWxlbWVudC5jZ0RyYWdnaW5nID0gdHJ1ZTtcbiAgICAgICAgZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdkcmFnZ2luZycpO1xuICAgICAgICBjb25zdCBnaG9zdCA9IHMuZG9tLmVsZW1lbnRzLmdob3N0O1xuICAgICAgICBpZiAoZ2hvc3QpIHtcbiAgICAgICAgICAgIGdob3N0LmNsYXNzTmFtZSA9IGBnaG9zdCAke3BpZWNlLmNvbG9yfSAke3BpZWNlLnJvbGV9YDtcbiAgICAgICAgICAgIHV0aWwudHJhbnNsYXRlQWJzKGdob3N0LCB1dGlsLnBvc1RvVHJhbnNsYXRlQWJzKGJvdW5kcykodXRpbC5rZXkycG9zKG9yaWcpLCBib2FyZC53aGl0ZVBvdihzKSkpO1xuICAgICAgICAgICAgdXRpbC5zZXRWaXNpYmxlKGdob3N0LCB0cnVlKTtcbiAgICAgICAgfVxuICAgICAgICBwcm9jZXNzRHJhZyhzKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIGlmIChoYWRQcmVtb3ZlKVxuICAgICAgICAgICAgYm9hcmQudW5zZXRQcmVtb3ZlKHMpO1xuICAgICAgICBpZiAoaGFkUHJlZHJvcClcbiAgICAgICAgICAgIGJvYXJkLnVuc2V0UHJlZHJvcChzKTtcbiAgICB9XG4gICAgcy5kb20ucmVkcmF3KCk7XG59XG5leHBvcnRzLnN0YXJ0ID0gc3RhcnQ7XG5mdW5jdGlvbiBwaWVjZUNsb3NlVG8ocywgcG9zKSB7XG4gICAgY29uc3QgYXNXaGl0ZSA9IGJvYXJkLndoaXRlUG92KHMpLCBib3VuZHMgPSBzLmRvbS5ib3VuZHMoKSwgcmFkaXVzU3EgPSBNYXRoLnBvdyhib3VuZHMud2lkdGggLyA4LCAyKTtcbiAgICBmb3IgKGNvbnN0IGtleSBpbiBzLnBpZWNlcykge1xuICAgICAgICBjb25zdCBjZW50ZXIgPSB1dGlsLmNvbXB1dGVTcXVhcmVDZW50ZXIoa2V5LCBhc1doaXRlLCBib3VuZHMpO1xuICAgICAgICBpZiAodXRpbC5kaXN0YW5jZVNxKGNlbnRlciwgcG9zKSA8PSByYWRpdXNTcSlcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG59XG5mdW5jdGlvbiBkcmFnTmV3UGllY2UocywgcGllY2UsIGUsIGZvcmNlKSB7XG4gICAgY29uc3Qga2V5ID0gJ2EwJztcbiAgICBzLnBpZWNlcy5zZXQoa2V5LCBwaWVjZSk7XG4gICAgcy5kb20ucmVkcmF3KCk7XG4gICAgY29uc3QgcG9zaXRpb24gPSB1dGlsLmV2ZW50UG9zaXRpb24oZSk7XG4gICAgcy5kcmFnZ2FibGUuY3VycmVudCA9IHtcbiAgICAgICAgb3JpZzoga2V5LFxuICAgICAgICBwaWVjZSxcbiAgICAgICAgb3JpZ1BvczogcG9zaXRpb24sXG4gICAgICAgIHBvczogcG9zaXRpb24sXG4gICAgICAgIHN0YXJ0ZWQ6IHRydWUsXG4gICAgICAgIGVsZW1lbnQ6ICgpID0+IHBpZWNlRWxlbWVudEJ5S2V5KHMsIGtleSksXG4gICAgICAgIG9yaWdpblRhcmdldDogZS50YXJnZXQsXG4gICAgICAgIG5ld1BpZWNlOiB0cnVlLFxuICAgICAgICBmb3JjZTogISFmb3JjZSxcbiAgICB9O1xuICAgIHByb2Nlc3NEcmFnKHMpO1xufVxuZXhwb3J0cy5kcmFnTmV3UGllY2UgPSBkcmFnTmV3UGllY2U7XG5mdW5jdGlvbiBwcm9jZXNzRHJhZyhzKSB7XG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgICAgdmFyIF9hO1xuICAgICAgICBjb25zdCBjdXIgPSBzLmRyYWdnYWJsZS5jdXJyZW50O1xuICAgICAgICBpZiAoIWN1cilcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgaWYgKChfYSA9IHMuYW5pbWF0aW9uLmN1cnJlbnQpID09PSBudWxsIHx8IF9hID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYS5wbGFuLmFuaW1zLmhhcyhjdXIub3JpZykpXG4gICAgICAgICAgICBzLmFuaW1hdGlvbi5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICAgICAgICBjb25zdCBvcmlnUGllY2UgPSBzLnBpZWNlcy5nZXQoY3VyLm9yaWcpO1xuICAgICAgICBpZiAoIW9yaWdQaWVjZSB8fCAhdXRpbC5zYW1lUGllY2Uob3JpZ1BpZWNlLCBjdXIucGllY2UpKVxuICAgICAgICAgICAgY2FuY2VsKHMpO1xuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGlmICghY3VyLnN0YXJ0ZWQgJiYgdXRpbC5kaXN0YW5jZVNxKGN1ci5wb3MsIGN1ci5vcmlnUG9zKSA+PSBNYXRoLnBvdyhzLmRyYWdnYWJsZS5kaXN0YW5jZSwgMikpXG4gICAgICAgICAgICAgICAgY3VyLnN0YXJ0ZWQgPSB0cnVlO1xuICAgICAgICAgICAgaWYgKGN1ci5zdGFydGVkKSB7XG4gICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjdXIuZWxlbWVudCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmb3VuZCA9IGN1ci5lbGVtZW50KCk7XG4gICAgICAgICAgICAgICAgICAgIGlmICghZm91bmQpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIGZvdW5kLmNnRHJhZ2dpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBmb3VuZC5jbGFzc0xpc3QuYWRkKCdkcmFnZ2luZycpO1xuICAgICAgICAgICAgICAgICAgICBjdXIuZWxlbWVudCA9IGZvdW5kO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBib3VuZHMgPSBzLmRvbS5ib3VuZHMoKTtcbiAgICAgICAgICAgICAgICB1dGlsLnRyYW5zbGF0ZUFicyhjdXIuZWxlbWVudCwgW1xuICAgICAgICAgICAgICAgICAgICBjdXIucG9zWzBdIC0gYm91bmRzLmxlZnQgLSBib3VuZHMud2lkdGggLyAxNixcbiAgICAgICAgICAgICAgICAgICAgY3VyLnBvc1sxXSAtIGJvdW5kcy50b3AgLSBib3VuZHMuaGVpZ2h0IC8gMTYsXG4gICAgICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcHJvY2Vzc0RyYWcocyk7XG4gICAgfSk7XG59XG5mdW5jdGlvbiBtb3ZlKHMsIGUpIHtcbiAgICBpZiAocy5kcmFnZ2FibGUuY3VycmVudCAmJiAoIWUudG91Y2hlcyB8fCBlLnRvdWNoZXMubGVuZ3RoIDwgMikpIHtcbiAgICAgICAgcy5kcmFnZ2FibGUuY3VycmVudC5wb3MgPSB1dGlsLmV2ZW50UG9zaXRpb24oZSk7XG4gICAgfVxufVxuZXhwb3J0cy5tb3ZlID0gbW92ZTtcbmZ1bmN0aW9uIGVuZChzLCBlKSB7XG4gICAgY29uc3QgY3VyID0gcy5kcmFnZ2FibGUuY3VycmVudDtcbiAgICBpZiAoIWN1cilcbiAgICAgICAgcmV0dXJuO1xuICAgIGlmIChlLnR5cGUgPT09ICd0b3VjaGVuZCcgJiYgZS5jYW5jZWxhYmxlICE9PSBmYWxzZSlcbiAgICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xuICAgIGlmIChlLnR5cGUgPT09ICd0b3VjaGVuZCcgJiYgY3VyLm9yaWdpblRhcmdldCAhPT0gZS50YXJnZXQgJiYgIWN1ci5uZXdQaWVjZSkge1xuICAgICAgICBzLmRyYWdnYWJsZS5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGJvYXJkLnVuc2V0UHJlbW92ZShzKTtcbiAgICBib2FyZC51bnNldFByZWRyb3Aocyk7XG4gICAgY29uc3QgZXZlbnRQb3MgPSB1dGlsLmV2ZW50UG9zaXRpb24oZSkgfHwgY3VyLnBvcztcbiAgICBjb25zdCBkZXN0ID0gYm9hcmQuZ2V0S2V5QXREb21Qb3MoZXZlbnRQb3MsIGJvYXJkLndoaXRlUG92KHMpLCBzLmRvbS5ib3VuZHMoKSk7XG4gICAgaWYgKGRlc3QgJiYgY3VyLnN0YXJ0ZWQgJiYgY3VyLm9yaWcgIT09IGRlc3QpIHtcbiAgICAgICAgaWYgKGN1ci5uZXdQaWVjZSlcbiAgICAgICAgICAgIGJvYXJkLmRyb3BOZXdQaWVjZShzLCBjdXIub3JpZywgZGVzdCwgY3VyLmZvcmNlKTtcbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICBzLnN0YXRzLmN0cmxLZXkgPSBlLmN0cmxLZXk7XG4gICAgICAgICAgICBpZiAoYm9hcmQudXNlck1vdmUocywgY3VyLm9yaWcsIGRlc3QpKVxuICAgICAgICAgICAgICAgIHMuc3RhdHMuZHJhZ2dlZCA9IHRydWU7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSBpZiAoY3VyLm5ld1BpZWNlKSB7XG4gICAgICAgIHMucGllY2VzLmRlbGV0ZShjdXIub3JpZyk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHMuZHJhZ2dhYmxlLmRlbGV0ZU9uRHJvcE9mZiAmJiAhZGVzdCkge1xuICAgICAgICBzLnBpZWNlcy5kZWxldGUoY3VyLm9yaWcpO1xuICAgICAgICBib2FyZC5jYWxsVXNlckZ1bmN0aW9uKHMuZXZlbnRzLmNoYW5nZSk7XG4gICAgfVxuICAgIGlmIChjdXIub3JpZyA9PT0gY3VyLnByZXZpb3VzbHlTZWxlY3RlZCAmJiAoY3VyLm9yaWcgPT09IGRlc3QgfHwgIWRlc3QpKVxuICAgICAgICBib2FyZC51bnNlbGVjdChzKTtcbiAgICBlbHNlIGlmICghcy5zZWxlY3RhYmxlLmVuYWJsZWQpXG4gICAgICAgIGJvYXJkLnVuc2VsZWN0KHMpO1xuICAgIHJlbW92ZURyYWdFbGVtZW50cyhzKTtcbiAgICBzLmRyYWdnYWJsZS5jdXJyZW50ID0gdW5kZWZpbmVkO1xuICAgIHMuZG9tLnJlZHJhdygpO1xufVxuZXhwb3J0cy5lbmQgPSBlbmQ7XG5mdW5jdGlvbiBjYW5jZWwocykge1xuICAgIGNvbnN0IGN1ciA9IHMuZHJhZ2dhYmxlLmN1cnJlbnQ7XG4gICAgaWYgKGN1cikge1xuICAgICAgICBpZiAoY3VyLm5ld1BpZWNlKVxuICAgICAgICAgICAgcy5waWVjZXMuZGVsZXRlKGN1ci5vcmlnKTtcbiAgICAgICAgcy5kcmFnZ2FibGUuY3VycmVudCA9IHVuZGVmaW5lZDtcbiAgICAgICAgYm9hcmQudW5zZWxlY3Qocyk7XG4gICAgICAgIHJlbW92ZURyYWdFbGVtZW50cyhzKTtcbiAgICAgICAgcy5kb20ucmVkcmF3KCk7XG4gICAgfVxufVxuZXhwb3J0cy5jYW5jZWwgPSBjYW5jZWw7XG5mdW5jdGlvbiByZW1vdmVEcmFnRWxlbWVudHMocykge1xuICAgIGNvbnN0IGUgPSBzLmRvbS5lbGVtZW50cztcbiAgICBpZiAoZS5naG9zdClcbiAgICAgICAgdXRpbC5zZXRWaXNpYmxlKGUuZ2hvc3QsIGZhbHNlKTtcbn1cbmZ1bmN0aW9uIHBpZWNlRWxlbWVudEJ5S2V5KHMsIGtleSkge1xuICAgIGxldCBlbCA9IHMuZG9tLmVsZW1lbnRzLmJvYXJkLmZpcnN0Q2hpbGQ7XG4gICAgd2hpbGUgKGVsKSB7XG4gICAgICAgIGlmIChlbC5jZ0tleSA9PT0ga2V5ICYmIGVsLnRhZ05hbWUgPT09ICdQSUVDRScpXG4gICAgICAgICAgICByZXR1cm4gZWw7XG4gICAgICAgIGVsID0gZWwubmV4dFNpYmxpbmc7XG4gICAgfVxuICAgIHJldHVybjtcbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWRyYWcuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5leHBvcnRzLmNsZWFyID0gZXhwb3J0cy5jYW5jZWwgPSBleHBvcnRzLmVuZCA9IGV4cG9ydHMubW92ZSA9IGV4cG9ydHMucHJvY2Vzc0RyYXcgPSBleHBvcnRzLnN0YXJ0ID0gdm9pZCAwO1xuY29uc3QgYm9hcmRfMSA9IHJlcXVpcmUoXCIuL2JvYXJkXCIpO1xuY29uc3QgdXRpbF8xID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmNvbnN0IGJydXNoZXMgPSBbJ2dyZWVuJywgJ3JlZCcsICdibHVlJywgJ3llbGxvdyddO1xuZnVuY3Rpb24gc3RhcnQoc3RhdGUsIGUpIHtcbiAgICBpZiAoZS50b3VjaGVzICYmIGUudG91Y2hlcy5sZW5ndGggPiAxKVxuICAgICAgICByZXR1cm47XG4gICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICBlLnByZXZlbnREZWZhdWx0KCk7XG4gICAgZS5jdHJsS2V5ID8gYm9hcmRfMS51bnNlbGVjdChzdGF0ZSkgOiBib2FyZF8xLmNhbmNlbE1vdmUoc3RhdGUpO1xuICAgIGNvbnN0IHBvcyA9IHV0aWxfMS5ldmVudFBvc2l0aW9uKGUpLCBvcmlnID0gYm9hcmRfMS5nZXRLZXlBdERvbVBvcyhwb3MsIGJvYXJkXzEud2hpdGVQb3Yoc3RhdGUpLCBzdGF0ZS5kb20uYm91bmRzKCkpO1xuICAgIGlmICghb3JpZylcbiAgICAgICAgcmV0dXJuO1xuICAgIHN0YXRlLmRyYXdhYmxlLmN1cnJlbnQgPSB7XG4gICAgICAgIG9yaWcsXG4gICAgICAgIHBvcyxcbiAgICAgICAgYnJ1c2g6IGV2ZW50QnJ1c2goZSksXG4gICAgICAgIHNuYXBUb1ZhbGlkTW92ZTogc3RhdGUuZHJhd2FibGUuZGVmYXVsdFNuYXBUb1ZhbGlkTW92ZSxcbiAgICB9O1xuICAgIHByb2Nlc3NEcmF3KHN0YXRlKTtcbn1cbmV4cG9ydHMuc3RhcnQgPSBzdGFydDtcbmZ1bmN0aW9uIHByb2Nlc3NEcmF3KHN0YXRlKSB7XG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKCgpID0+IHtcbiAgICAgICAgY29uc3QgY3VyID0gc3RhdGUuZHJhd2FibGUuY3VycmVudDtcbiAgICAgICAgaWYgKGN1cikge1xuICAgICAgICAgICAgY29uc3Qga2V5QXREb21Qb3MgPSBib2FyZF8xLmdldEtleUF0RG9tUG9zKGN1ci5wb3MsIGJvYXJkXzEud2hpdGVQb3Yoc3RhdGUpLCBzdGF0ZS5kb20uYm91bmRzKCkpO1xuICAgICAgICAgICAgaWYgKCFrZXlBdERvbVBvcykge1xuICAgICAgICAgICAgICAgIGN1ci5zbmFwVG9WYWxpZE1vdmUgPSBmYWxzZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnN0IG1vdXNlU3EgPSBjdXIuc25hcFRvVmFsaWRNb3ZlXG4gICAgICAgICAgICAgICAgPyBib2FyZF8xLmdldFNuYXBwZWRLZXlBdERvbVBvcyhjdXIub3JpZywgY3VyLnBvcywgYm9hcmRfMS53aGl0ZVBvdihzdGF0ZSksIHN0YXRlLmRvbS5ib3VuZHMoKSlcbiAgICAgICAgICAgICAgICA6IGtleUF0RG9tUG9zO1xuICAgICAgICAgICAgaWYgKG1vdXNlU3EgIT09IGN1ci5tb3VzZVNxKSB7XG4gICAgICAgICAgICAgICAgY3VyLm1vdXNlU3EgPSBtb3VzZVNxO1xuICAgICAgICAgICAgICAgIGN1ci5kZXN0ID0gbW91c2VTcSAhPT0gY3VyLm9yaWcgPyBtb3VzZVNxIDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIHN0YXRlLmRvbS5yZWRyYXdOb3coKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHByb2Nlc3NEcmF3KHN0YXRlKTtcbiAgICAgICAgfVxuICAgIH0pO1xufVxuZXhwb3J0cy5wcm9jZXNzRHJhdyA9IHByb2Nlc3NEcmF3O1xuZnVuY3Rpb24gbW92ZShzdGF0ZSwgZSkge1xuICAgIGlmIChzdGF0ZS5kcmF3YWJsZS5jdXJyZW50KVxuICAgICAgICBzdGF0ZS5kcmF3YWJsZS5jdXJyZW50LnBvcyA9IHV0aWxfMS5ldmVudFBvc2l0aW9uKGUpO1xufVxuZXhwb3J0cy5tb3ZlID0gbW92ZTtcbmZ1bmN0aW9uIGVuZChzdGF0ZSkge1xuICAgIGNvbnN0IGN1ciA9IHN0YXRlLmRyYXdhYmxlLmN1cnJlbnQ7XG4gICAgaWYgKGN1cikge1xuICAgICAgICBpZiAoY3VyLm1vdXNlU3EpXG4gICAgICAgICAgICBhZGRTaGFwZShzdGF0ZS5kcmF3YWJsZSwgY3VyKTtcbiAgICAgICAgY2FuY2VsKHN0YXRlKTtcbiAgICB9XG59XG5leHBvcnRzLmVuZCA9IGVuZDtcbmZ1bmN0aW9uIGNhbmNlbChzdGF0ZSkge1xuICAgIGlmIChzdGF0ZS5kcmF3YWJsZS5jdXJyZW50KSB7XG4gICAgICAgIHN0YXRlLmRyYXdhYmxlLmN1cnJlbnQgPSB1bmRlZmluZWQ7XG4gICAgICAgIHN0YXRlLmRvbS5yZWRyYXcoKTtcbiAgICB9XG59XG5leHBvcnRzLmNhbmNlbCA9IGNhbmNlbDtcbmZ1bmN0aW9uIGNsZWFyKHN0YXRlKSB7XG4gICAgaWYgKHN0YXRlLmRyYXdhYmxlLnNoYXBlcy5sZW5ndGgpIHtcbiAgICAgICAgc3RhdGUuZHJhd2FibGUuc2hhcGVzID0gW107XG4gICAgICAgIHN0YXRlLmRvbS5yZWRyYXcoKTtcbiAgICAgICAgb25DaGFuZ2Uoc3RhdGUuZHJhd2FibGUpO1xuICAgIH1cbn1cbmV4cG9ydHMuY2xlYXIgPSBjbGVhcjtcbmZ1bmN0aW9uIGV2ZW50QnJ1c2goZSkge1xuICAgIHZhciBfYTtcbiAgICBjb25zdCBtb2RBID0gKGUuc2hpZnRLZXkgfHwgZS5jdHJsS2V5KSAmJiB1dGlsXzEuaXNSaWdodEJ1dHRvbihlKTtcbiAgICBjb25zdCBtb2RCID0gZS5hbHRLZXkgfHwgZS5tZXRhS2V5IHx8ICgoX2EgPSBlLmdldE1vZGlmaWVyU3RhdGUpID09PSBudWxsIHx8IF9hID09PSB2b2lkIDAgPyB2b2lkIDAgOiBfYS5jYWxsKGUsICdBbHRHcmFwaCcpKTtcbiAgICByZXR1cm4gYnJ1c2hlc1sobW9kQSA/IDEgOiAwKSArIChtb2RCID8gMiA6IDApXTtcbn1cbmZ1bmN0aW9uIGFkZFNoYXBlKGRyYXdhYmxlLCBjdXIpIHtcbiAgICBjb25zdCBzYW1lU2hhcGUgPSAocykgPT4gcy5vcmlnID09PSBjdXIub3JpZyAmJiBzLmRlc3QgPT09IGN1ci5kZXN0O1xuICAgIGNvbnN0IHNpbWlsYXIgPSBkcmF3YWJsZS5zaGFwZXMuZmluZChzYW1lU2hhcGUpO1xuICAgIGlmIChzaW1pbGFyKVxuICAgICAgICBkcmF3YWJsZS5zaGFwZXMgPSBkcmF3YWJsZS5zaGFwZXMuZmlsdGVyKHMgPT4gIXNhbWVTaGFwZShzKSk7XG4gICAgaWYgKCFzaW1pbGFyIHx8IHNpbWlsYXIuYnJ1c2ggIT09IGN1ci5icnVzaClcbiAgICAgICAgZHJhd2FibGUuc2hhcGVzLnB1c2goY3VyKTtcbiAgICBvbkNoYW5nZShkcmF3YWJsZSk7XG59XG5mdW5jdGlvbiBvbkNoYW5nZShkcmF3YWJsZSkge1xuICAgIGlmIChkcmF3YWJsZS5vbkNoYW5nZSlcbiAgICAgICAgZHJhd2FibGUub25DaGFuZ2UoZHJhd2FibGUuc2hhcGVzKTtcbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWRyYXcuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5leHBvcnRzLmRyb3AgPSBleHBvcnRzLmNhbmNlbERyb3BNb2RlID0gZXhwb3J0cy5zZXREcm9wTW9kZSA9IHZvaWQgMDtcbmNvbnN0IGJvYXJkID0gcmVxdWlyZShcIi4vYm9hcmRcIik7XG5jb25zdCB1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmNvbnN0IGRyYWdfMSA9IHJlcXVpcmUoXCIuL2RyYWdcIik7XG5mdW5jdGlvbiBzZXREcm9wTW9kZShzLCBwaWVjZSkge1xuICAgIHMuZHJvcG1vZGUgPSB7XG4gICAgICAgIGFjdGl2ZTogdHJ1ZSxcbiAgICAgICAgcGllY2UsXG4gICAgfTtcbiAgICBkcmFnXzEuY2FuY2VsKHMpO1xufVxuZXhwb3J0cy5zZXREcm9wTW9kZSA9IHNldERyb3BNb2RlO1xuZnVuY3Rpb24gY2FuY2VsRHJvcE1vZGUocykge1xuICAgIHMuZHJvcG1vZGUgPSB7XG4gICAgICAgIGFjdGl2ZTogZmFsc2UsXG4gICAgfTtcbn1cbmV4cG9ydHMuY2FuY2VsRHJvcE1vZGUgPSBjYW5jZWxEcm9wTW9kZTtcbmZ1bmN0aW9uIGRyb3AocywgZSkge1xuICAgIGlmICghcy5kcm9wbW9kZS5hY3RpdmUpXG4gICAgICAgIHJldHVybjtcbiAgICBib2FyZC51bnNldFByZW1vdmUocyk7XG4gICAgYm9hcmQudW5zZXRQcmVkcm9wKHMpO1xuICAgIGNvbnN0IHBpZWNlID0gcy5kcm9wbW9kZS5waWVjZTtcbiAgICBpZiAocGllY2UpIHtcbiAgICAgICAgcy5waWVjZXMuc2V0KCdhMCcsIHBpZWNlKTtcbiAgICAgICAgY29uc3QgcG9zaXRpb24gPSB1dGlsLmV2ZW50UG9zaXRpb24oZSk7XG4gICAgICAgIGNvbnN0IGRlc3QgPSBwb3NpdGlvbiAmJiBib2FyZC5nZXRLZXlBdERvbVBvcyhwb3NpdGlvbiwgYm9hcmQud2hpdGVQb3YocyksIHMuZG9tLmJvdW5kcygpKTtcbiAgICAgICAgaWYgKGRlc3QpXG4gICAgICAgICAgICBib2FyZC5kcm9wTmV3UGllY2UocywgJ2EwJywgZGVzdCk7XG4gICAgfVxuICAgIHMuZG9tLnJlZHJhdygpO1xufVxuZXhwb3J0cy5kcm9wID0gZHJvcDtcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWRyb3AuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5leHBvcnRzLmJpbmREb2N1bWVudCA9IGV4cG9ydHMuYmluZEJvYXJkID0gdm9pZCAwO1xuY29uc3QgZHJhZyA9IHJlcXVpcmUoXCIuL2RyYWdcIik7XG5jb25zdCBkcmF3ID0gcmVxdWlyZShcIi4vZHJhd1wiKTtcbmNvbnN0IGRyb3BfMSA9IHJlcXVpcmUoXCIuL2Ryb3BcIik7XG5jb25zdCB1dGlsXzEgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuZnVuY3Rpb24gYmluZEJvYXJkKHMsIGJvdW5kc1VwZGF0ZWQpIHtcbiAgICBjb25zdCBib2FyZEVsID0gcy5kb20uZWxlbWVudHMuYm9hcmQ7XG4gICAgaWYgKCFzLmRvbS5yZWxhdGl2ZSAmJiBzLnJlc2l6YWJsZSAmJiAnUmVzaXplT2JzZXJ2ZXInIGluIHdpbmRvdykge1xuICAgICAgICBjb25zdCBvYnNlcnZlciA9IG5ldyB3aW5kb3dbJ1Jlc2l6ZU9ic2VydmVyJ10oYm91bmRzVXBkYXRlZCk7XG4gICAgICAgIG9ic2VydmVyLm9ic2VydmUoYm9hcmRFbCk7XG4gICAgfVxuICAgIGlmIChzLnZpZXdPbmx5KVxuICAgICAgICByZXR1cm47XG4gICAgY29uc3Qgb25TdGFydCA9IHN0YXJ0RHJhZ09yRHJhdyhzKTtcbiAgICBib2FyZEVsLmFkZEV2ZW50TGlzdGVuZXIoJ3RvdWNoc3RhcnQnLCBvblN0YXJ0LCB7XG4gICAgICAgIHBhc3NpdmU6IGZhbHNlLFxuICAgIH0pO1xuICAgIGJvYXJkRWwuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgb25TdGFydCwge1xuICAgICAgICBwYXNzaXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICBpZiAocy5kaXNhYmxlQ29udGV4dE1lbnUgfHwgcy5kcmF3YWJsZS5lbmFibGVkKSB7XG4gICAgICAgIGJvYXJkRWwuYWRkRXZlbnRMaXN0ZW5lcignY29udGV4dG1lbnUnLCBlID0+IGUucHJldmVudERlZmF1bHQoKSk7XG4gICAgfVxufVxuZXhwb3J0cy5iaW5kQm9hcmQgPSBiaW5kQm9hcmQ7XG5mdW5jdGlvbiBiaW5kRG9jdW1lbnQocywgYm91bmRzVXBkYXRlZCkge1xuICAgIGNvbnN0IHVuYmluZHMgPSBbXTtcbiAgICBpZiAoIXMuZG9tLnJlbGF0aXZlICYmIHMucmVzaXphYmxlICYmICEoJ1Jlc2l6ZU9ic2VydmVyJyBpbiB3aW5kb3cpKSB7XG4gICAgICAgIHVuYmluZHMucHVzaCh1bmJpbmRhYmxlKGRvY3VtZW50LmJvZHksICdjaGVzc2dyb3VuZC5yZXNpemUnLCBib3VuZHNVcGRhdGVkKSk7XG4gICAgfVxuICAgIGlmICghcy52aWV3T25seSkge1xuICAgICAgICBjb25zdCBvbm1vdmUgPSBkcmFnT3JEcmF3KHMsIGRyYWcubW92ZSwgZHJhdy5tb3ZlKTtcbiAgICAgICAgY29uc3Qgb25lbmQgPSBkcmFnT3JEcmF3KHMsIGRyYWcuZW5kLCBkcmF3LmVuZCk7XG4gICAgICAgIGZvciAoY29uc3QgZXYgb2YgWyd0b3VjaG1vdmUnLCAnbW91c2Vtb3ZlJ10pXG4gICAgICAgICAgICB1bmJpbmRzLnB1c2godW5iaW5kYWJsZShkb2N1bWVudCwgZXYsIG9ubW92ZSkpO1xuICAgICAgICBmb3IgKGNvbnN0IGV2IG9mIFsndG91Y2hlbmQnLCAnbW91c2V1cCddKVxuICAgICAgICAgICAgdW5iaW5kcy5wdXNoKHVuYmluZGFibGUoZG9jdW1lbnQsIGV2LCBvbmVuZCkpO1xuICAgICAgICBjb25zdCBvblNjcm9sbCA9ICgpID0+IHMuZG9tLmJvdW5kcy5jbGVhcigpO1xuICAgICAgICB1bmJpbmRzLnB1c2godW5iaW5kYWJsZShkb2N1bWVudCwgJ3Njcm9sbCcsIG9uU2Nyb2xsLCB7IGNhcHR1cmU6IHRydWUsIHBhc3NpdmU6IHRydWUgfSkpO1xuICAgICAgICB1bmJpbmRzLnB1c2godW5iaW5kYWJsZSh3aW5kb3csICdyZXNpemUnLCBvblNjcm9sbCwgeyBwYXNzaXZlOiB0cnVlIH0pKTtcbiAgICB9XG4gICAgcmV0dXJuICgpID0+IHVuYmluZHMuZm9yRWFjaChmID0+IGYoKSk7XG59XG5leHBvcnRzLmJpbmREb2N1bWVudCA9IGJpbmREb2N1bWVudDtcbmZ1bmN0aW9uIHVuYmluZGFibGUoZWwsIGV2ZW50TmFtZSwgY2FsbGJhY2ssIG9wdGlvbnMpIHtcbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgY2FsbGJhY2ssIG9wdGlvbnMpO1xuICAgIHJldHVybiAoKSA9PiBlbC5yZW1vdmVFdmVudExpc3RlbmVyKGV2ZW50TmFtZSwgY2FsbGJhY2ssIG9wdGlvbnMpO1xufVxuZnVuY3Rpb24gc3RhcnREcmFnT3JEcmF3KHMpIHtcbiAgICByZXR1cm4gZSA9PiB7XG4gICAgICAgIGlmIChzLmRyYWdnYWJsZS5jdXJyZW50KVxuICAgICAgICAgICAgZHJhZy5jYW5jZWwocyk7XG4gICAgICAgIGVsc2UgaWYgKHMuZHJhd2FibGUuY3VycmVudClcbiAgICAgICAgICAgIGRyYXcuY2FuY2VsKHMpO1xuICAgICAgICBlbHNlIGlmIChlLnNoaWZ0S2V5IHx8IHV0aWxfMS5pc1JpZ2h0QnV0dG9uKGUpKSB7XG4gICAgICAgICAgICBpZiAocy5kcmF3YWJsZS5lbmFibGVkKVxuICAgICAgICAgICAgICAgIGRyYXcuc3RhcnQocywgZSk7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoIXMudmlld09ubHkpIHtcbiAgICAgICAgICAgIGlmIChzLmRyb3Btb2RlLmFjdGl2ZSlcbiAgICAgICAgICAgICAgICBkcm9wXzEuZHJvcChzLCBlKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICBkcmFnLnN0YXJ0KHMsIGUpO1xuICAgICAgICB9XG4gICAgfTtcbn1cbmZ1bmN0aW9uIGRyYWdPckRyYXcocywgd2l0aERyYWcsIHdpdGhEcmF3KSB7XG4gICAgcmV0dXJuIGUgPT4ge1xuICAgICAgICBpZiAocy5kcmF3YWJsZS5jdXJyZW50KSB7XG4gICAgICAgICAgICBpZiAocy5kcmF3YWJsZS5lbmFibGVkKVxuICAgICAgICAgICAgICAgIHdpdGhEcmF3KHMsIGUpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2UgaWYgKCFzLnZpZXdPbmx5KVxuICAgICAgICAgICAgd2l0aERyYWcocywgZSk7XG4gICAgfTtcbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWV2ZW50cy5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmV4cG9ydHMuZXhwbG9zaW9uID0gdm9pZCAwO1xuZnVuY3Rpb24gZXhwbG9zaW9uKHN0YXRlLCBrZXlzKSB7XG4gICAgc3RhdGUuZXhwbG9kaW5nID0geyBzdGFnZTogMSwga2V5cyB9O1xuICAgIHN0YXRlLmRvbS5yZWRyYXcoKTtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgc2V0U3RhZ2Uoc3RhdGUsIDIpO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHNldFN0YWdlKHN0YXRlLCB1bmRlZmluZWQpLCAxMjApO1xuICAgIH0sIDEyMCk7XG59XG5leHBvcnRzLmV4cGxvc2lvbiA9IGV4cGxvc2lvbjtcbmZ1bmN0aW9uIHNldFN0YWdlKHN0YXRlLCBzdGFnZSkge1xuICAgIGlmIChzdGF0ZS5leHBsb2RpbmcpIHtcbiAgICAgICAgaWYgKHN0YWdlKVxuICAgICAgICAgICAgc3RhdGUuZXhwbG9kaW5nLnN0YWdlID0gc3RhZ2U7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHN0YXRlLmV4cGxvZGluZyA9IHVuZGVmaW5lZDtcbiAgICAgICAgc3RhdGUuZG9tLnJlZHJhdygpO1xuICAgIH1cbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWV4cGxvc2lvbi5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmV4cG9ydHMud3JpdGUgPSBleHBvcnRzLnJlYWQgPSBleHBvcnRzLmluaXRpYWwgPSB2b2lkIDA7XG5jb25zdCB1dGlsXzEgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuY29uc3QgY2cgPSByZXF1aXJlKFwiLi90eXBlc1wiKTtcbmV4cG9ydHMuaW5pdGlhbCA9ICdybmJxa2Juci9wcHBwcHBwcC84LzgvOC84L1BQUFBQUFBQL1JOQlFLQk5SJztcbmNvbnN0IHJvbGVzID0ge1xuICAgIHA6ICdwYXduJyxcbiAgICByOiAncm9vaycsXG4gICAgbjogJ2tuaWdodCcsXG4gICAgYjogJ2Jpc2hvcCcsXG4gICAgcTogJ3F1ZWVuJyxcbiAgICBrOiAna2luZycsXG59O1xuY29uc3QgbGV0dGVycyA9IHtcbiAgICBwYXduOiAncCcsXG4gICAgcm9vazogJ3InLFxuICAgIGtuaWdodDogJ24nLFxuICAgIGJpc2hvcDogJ2InLFxuICAgIHF1ZWVuOiAncScsXG4gICAga2luZzogJ2snLFxufTtcbmZ1bmN0aW9uIHJlYWQoZmVuKSB7XG4gICAgaWYgKGZlbiA9PT0gJ3N0YXJ0JylcbiAgICAgICAgZmVuID0gZXhwb3J0cy5pbml0aWFsO1xuICAgIGNvbnN0IHBpZWNlcyA9IG5ldyBNYXAoKTtcbiAgICBsZXQgcm93ID0gNywgY29sID0gMDtcbiAgICBmb3IgKGNvbnN0IGMgb2YgZmVuKSB7XG4gICAgICAgIHN3aXRjaCAoYykge1xuICAgICAgICAgICAgY2FzZSAnICc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIHBpZWNlcztcbiAgICAgICAgICAgIGNhc2UgJy8nOlxuICAgICAgICAgICAgICAgIC0tcm93O1xuICAgICAgICAgICAgICAgIGlmIChyb3cgPCAwKVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gcGllY2VzO1xuICAgICAgICAgICAgICAgIGNvbCA9IDA7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICd+JzpcbiAgICAgICAgICAgICAgICBjb25zdCBwaWVjZSA9IHBpZWNlcy5nZXQodXRpbF8xLnBvczJrZXkoW2NvbCwgcm93XSkpO1xuICAgICAgICAgICAgICAgIGlmIChwaWVjZSlcbiAgICAgICAgICAgICAgICAgICAgcGllY2UucHJvbW90ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgICAgICBjb25zdCBuYiA9IGMuY2hhckNvZGVBdCgwKTtcbiAgICAgICAgICAgICAgICBpZiAobmIgPCA1NylcbiAgICAgICAgICAgICAgICAgICAgY29sICs9IG5iIC0gNDg7XG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJvbGUgPSBjLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIHBpZWNlcy5zZXQodXRpbF8xLnBvczJrZXkoW2NvbCwgcm93XSksIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJvbGU6IHJvbGVzW3JvbGVdLFxuICAgICAgICAgICAgICAgICAgICAgICAgY29sb3I6IGMgPT09IHJvbGUgPyAnYmxhY2snIDogJ3doaXRlJyxcbiAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICsrY29sO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcGllY2VzO1xufVxuZXhwb3J0cy5yZWFkID0gcmVhZDtcbmZ1bmN0aW9uIHdyaXRlKHBpZWNlcykge1xuICAgIHJldHVybiB1dGlsXzEuaW52UmFua3NcbiAgICAgICAgLm1hcCh5ID0+IGNnLmZpbGVzXG4gICAgICAgIC5tYXAoeCA9PiB7XG4gICAgICAgIGNvbnN0IHBpZWNlID0gcGllY2VzLmdldCgoeCArIHkpKTtcbiAgICAgICAgaWYgKHBpZWNlKSB7XG4gICAgICAgICAgICBjb25zdCBsZXR0ZXIgPSBsZXR0ZXJzW3BpZWNlLnJvbGVdO1xuICAgICAgICAgICAgcmV0dXJuIHBpZWNlLmNvbG9yID09PSAnd2hpdGUnID8gbGV0dGVyLnRvVXBwZXJDYXNlKCkgOiBsZXR0ZXI7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmV0dXJuICcxJztcbiAgICB9KVxuICAgICAgICAuam9pbignJykpXG4gICAgICAgIC5qb2luKCcvJylcbiAgICAgICAgLnJlcGxhY2UoLzF7Mix9L2csIHMgPT4gcy5sZW5ndGgudG9TdHJpbmcoKSk7XG59XG5leHBvcnRzLndyaXRlID0gd3JpdGU7XG4vLyMgc291cmNlTWFwcGluZ1VSTD1mZW4uanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5leHBvcnRzLnByZW1vdmUgPSBleHBvcnRzLnF1ZWVuID0gZXhwb3J0cy5rbmlnaHQgPSB2b2lkIDA7XG5jb25zdCB1dGlsID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmZ1bmN0aW9uIGRpZmYoYSwgYikge1xuICAgIHJldHVybiBNYXRoLmFicyhhIC0gYik7XG59XG5mdW5jdGlvbiBwYXduKGNvbG9yKSB7XG4gICAgcmV0dXJuICh4MSwgeTEsIHgyLCB5MikgPT4gZGlmZih4MSwgeDIpIDwgMiAmJlxuICAgICAgICAoY29sb3IgPT09ICd3aGl0ZSdcbiAgICAgICAgICAgID9cbiAgICAgICAgICAgICAgICB5MiA9PT0geTEgKyAxIHx8ICh5MSA8PSAxICYmIHkyID09PSB5MSArIDIgJiYgeDEgPT09IHgyKVxuICAgICAgICAgICAgOiB5MiA9PT0geTEgLSAxIHx8ICh5MSA+PSA2ICYmIHkyID09PSB5MSAtIDIgJiYgeDEgPT09IHgyKSk7XG59XG5jb25zdCBrbmlnaHQgPSAoeDEsIHkxLCB4MiwgeTIpID0+IHtcbiAgICBjb25zdCB4ZCA9IGRpZmYoeDEsIHgyKTtcbiAgICBjb25zdCB5ZCA9IGRpZmYoeTEsIHkyKTtcbiAgICByZXR1cm4gKHhkID09PSAxICYmIHlkID09PSAyKSB8fCAoeGQgPT09IDIgJiYgeWQgPT09IDEpO1xufTtcbmV4cG9ydHMua25pZ2h0ID0ga25pZ2h0O1xuY29uc3QgYmlzaG9wID0gKHgxLCB5MSwgeDIsIHkyKSA9PiB7XG4gICAgcmV0dXJuIGRpZmYoeDEsIHgyKSA9PT0gZGlmZih5MSwgeTIpO1xufTtcbmNvbnN0IHJvb2sgPSAoeDEsIHkxLCB4MiwgeTIpID0+IHtcbiAgICByZXR1cm4geDEgPT09IHgyIHx8IHkxID09PSB5Mjtcbn07XG5jb25zdCBxdWVlbiA9ICh4MSwgeTEsIHgyLCB5MikgPT4ge1xuICAgIHJldHVybiBiaXNob3AoeDEsIHkxLCB4MiwgeTIpIHx8IHJvb2soeDEsIHkxLCB4MiwgeTIpO1xufTtcbmV4cG9ydHMucXVlZW4gPSBxdWVlbjtcbmZ1bmN0aW9uIGtpbmcoY29sb3IsIHJvb2tGaWxlcywgY2FuQ2FzdGxlKSB7XG4gICAgcmV0dXJuICh4MSwgeTEsIHgyLCB5MikgPT4gKGRpZmYoeDEsIHgyKSA8IDIgJiYgZGlmZih5MSwgeTIpIDwgMikgfHxcbiAgICAgICAgKGNhbkNhc3RsZSAmJlxuICAgICAgICAgICAgeTEgPT09IHkyICYmXG4gICAgICAgICAgICB5MSA9PT0gKGNvbG9yID09PSAnd2hpdGUnID8gMCA6IDcpICYmXG4gICAgICAgICAgICAoKHgxID09PSA0ICYmICgoeDIgPT09IDIgJiYgcm9va0ZpbGVzLmluY2x1ZGVzKDApKSB8fCAoeDIgPT09IDYgJiYgcm9va0ZpbGVzLmluY2x1ZGVzKDcpKSkpIHx8XG4gICAgICAgICAgICAgICAgcm9va0ZpbGVzLmluY2x1ZGVzKHgyKSkpO1xufVxuZnVuY3Rpb24gcm9va0ZpbGVzT2YocGllY2VzLCBjb2xvcikge1xuICAgIGNvbnN0IGJhY2tyYW5rID0gY29sb3IgPT09ICd3aGl0ZScgPyAnMScgOiAnOCc7XG4gICAgY29uc3QgZmlsZXMgPSBbXTtcbiAgICBmb3IgKGNvbnN0IFtrZXksIHBpZWNlXSBvZiBwaWVjZXMpIHtcbiAgICAgICAgaWYgKGtleVsxXSA9PT0gYmFja3JhbmsgJiYgcGllY2UuY29sb3IgPT09IGNvbG9yICYmIHBpZWNlLnJvbGUgPT09ICdyb29rJykge1xuICAgICAgICAgICAgZmlsZXMucHVzaCh1dGlsLmtleTJwb3Moa2V5KVswXSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIGZpbGVzO1xufVxuZnVuY3Rpb24gcHJlbW92ZShwaWVjZXMsIGtleSwgY2FuQ2FzdGxlKSB7XG4gICAgY29uc3QgcGllY2UgPSBwaWVjZXMuZ2V0KGtleSk7XG4gICAgaWYgKCFwaWVjZSlcbiAgICAgICAgcmV0dXJuIFtdO1xuICAgIGNvbnN0IHBvcyA9IHV0aWwua2V5MnBvcyhrZXkpLCByID0gcGllY2Uucm9sZSwgbW9iaWxpdHkgPSByID09PSAncGF3bidcbiAgICAgICAgPyBwYXduKHBpZWNlLmNvbG9yKVxuICAgICAgICA6IHIgPT09ICdrbmlnaHQnXG4gICAgICAgICAgICA/IGV4cG9ydHMua25pZ2h0XG4gICAgICAgICAgICA6IHIgPT09ICdiaXNob3AnXG4gICAgICAgICAgICAgICAgPyBiaXNob3BcbiAgICAgICAgICAgICAgICA6IHIgPT09ICdyb29rJ1xuICAgICAgICAgICAgICAgICAgICA/IHJvb2tcbiAgICAgICAgICAgICAgICAgICAgOiByID09PSAncXVlZW4nXG4gICAgICAgICAgICAgICAgICAgICAgICA/IGV4cG9ydHMucXVlZW5cbiAgICAgICAgICAgICAgICAgICAgICAgIDoga2luZyhwaWVjZS5jb2xvciwgcm9va0ZpbGVzT2YocGllY2VzLCBwaWVjZS5jb2xvciksIGNhbkNhc3RsZSk7XG4gICAgcmV0dXJuIHV0aWwuYWxsUG9zXG4gICAgICAgIC5maWx0ZXIocG9zMiA9PiAocG9zWzBdICE9PSBwb3MyWzBdIHx8IHBvc1sxXSAhPT0gcG9zMlsxXSkgJiYgbW9iaWxpdHkocG9zWzBdLCBwb3NbMV0sIHBvczJbMF0sIHBvczJbMV0pKVxuICAgICAgICAubWFwKHV0aWwucG9zMmtleSk7XG59XG5leHBvcnRzLnByZW1vdmUgPSBwcmVtb3ZlO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9cHJlbW92ZS5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmV4cG9ydHMudXBkYXRlQm91bmRzID0gZXhwb3J0cy5yZW5kZXIgPSB2b2lkIDA7XG5jb25zdCB1dGlsXzEgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuY29uc3QgYm9hcmRfMSA9IHJlcXVpcmUoXCIuL2JvYXJkXCIpO1xuY29uc3QgdXRpbCA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5mdW5jdGlvbiByZW5kZXIocykge1xuICAgIGNvbnN0IGFzV2hpdGUgPSBib2FyZF8xLndoaXRlUG92KHMpLCBwb3NUb1RyYW5zbGF0ZSA9IHMuZG9tLnJlbGF0aXZlID8gdXRpbC5wb3NUb1RyYW5zbGF0ZVJlbCA6IHV0aWwucG9zVG9UcmFuc2xhdGVBYnMocy5kb20uYm91bmRzKCkpLCB0cmFuc2xhdGUgPSBzLmRvbS5yZWxhdGl2ZSA/IHV0aWwudHJhbnNsYXRlUmVsIDogdXRpbC50cmFuc2xhdGVBYnMsIGJvYXJkRWwgPSBzLmRvbS5lbGVtZW50cy5ib2FyZCwgcGllY2VzID0gcy5waWVjZXMsIGN1ckFuaW0gPSBzLmFuaW1hdGlvbi5jdXJyZW50LCBhbmltcyA9IGN1ckFuaW0gPyBjdXJBbmltLnBsYW4uYW5pbXMgOiBuZXcgTWFwKCksIGZhZGluZ3MgPSBjdXJBbmltID8gY3VyQW5pbS5wbGFuLmZhZGluZ3MgOiBuZXcgTWFwKCksIGN1ckRyYWcgPSBzLmRyYWdnYWJsZS5jdXJyZW50LCBzcXVhcmVzID0gY29tcHV0ZVNxdWFyZUNsYXNzZXMocyksIHNhbWVQaWVjZXMgPSBuZXcgU2V0KCksIHNhbWVTcXVhcmVzID0gbmV3IFNldCgpLCBtb3ZlZFBpZWNlcyA9IG5ldyBNYXAoKSwgbW92ZWRTcXVhcmVzID0gbmV3IE1hcCgpO1xuICAgIGxldCBrLCBlbCwgcGllY2VBdEtleSwgZWxQaWVjZU5hbWUsIGFuaW0sIGZhZGluZywgcE12ZHNldCwgcE12ZCwgc012ZHNldCwgc012ZDtcbiAgICBlbCA9IGJvYXJkRWwuZmlyc3RDaGlsZDtcbiAgICB3aGlsZSAoZWwpIHtcbiAgICAgICAgayA9IGVsLmNnS2V5O1xuICAgICAgICBpZiAoaXNQaWVjZU5vZGUoZWwpKSB7XG4gICAgICAgICAgICBwaWVjZUF0S2V5ID0gcGllY2VzLmdldChrKTtcbiAgICAgICAgICAgIGFuaW0gPSBhbmltcy5nZXQoayk7XG4gICAgICAgICAgICBmYWRpbmcgPSBmYWRpbmdzLmdldChrKTtcbiAgICAgICAgICAgIGVsUGllY2VOYW1lID0gZWwuY2dQaWVjZTtcbiAgICAgICAgICAgIGlmIChlbC5jZ0RyYWdnaW5nICYmICghY3VyRHJhZyB8fCBjdXJEcmFnLm9yaWcgIT09IGspKSB7XG4gICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LnJlbW92ZSgnZHJhZ2dpbmcnKTtcbiAgICAgICAgICAgICAgICB0cmFuc2xhdGUoZWwsIHBvc1RvVHJhbnNsYXRlKHV0aWxfMS5rZXkycG9zKGspLCBhc1doaXRlKSk7XG4gICAgICAgICAgICAgICAgZWwuY2dEcmFnZ2luZyA9IGZhbHNlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFmYWRpbmcgJiYgZWwuY2dGYWRpbmcpIHtcbiAgICAgICAgICAgICAgICBlbC5jZ0ZhZGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ2ZhZGluZycpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHBpZWNlQXRLZXkpIHtcbiAgICAgICAgICAgICAgICBpZiAoYW5pbSAmJiBlbC5jZ0FuaW1hdGluZyAmJiBlbFBpZWNlTmFtZSA9PT0gcGllY2VOYW1lT2YocGllY2VBdEtleSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcG9zID0gdXRpbF8xLmtleTJwb3Moayk7XG4gICAgICAgICAgICAgICAgICAgIHBvc1swXSArPSBhbmltWzJdO1xuICAgICAgICAgICAgICAgICAgICBwb3NbMV0gKz0gYW5pbVszXTtcbiAgICAgICAgICAgICAgICAgICAgZWwuY2xhc3NMaXN0LmFkZCgnYW5pbScpO1xuICAgICAgICAgICAgICAgICAgICB0cmFuc2xhdGUoZWwsIHBvc1RvVHJhbnNsYXRlKHBvcywgYXNXaGl0ZSkpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmIChlbC5jZ0FuaW1hdGluZykge1xuICAgICAgICAgICAgICAgICAgICBlbC5jZ0FuaW1hdGluZyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdhbmltJyk7XG4gICAgICAgICAgICAgICAgICAgIHRyYW5zbGF0ZShlbCwgcG9zVG9UcmFuc2xhdGUodXRpbF8xLmtleTJwb3MoayksIGFzV2hpdGUpKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHMuYWRkUGllY2VaSW5kZXgpXG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5zdHlsZS56SW5kZXggPSBwb3NaSW5kZXgodXRpbF8xLmtleTJwb3MoayksIGFzV2hpdGUpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoZWxQaWVjZU5hbWUgPT09IHBpZWNlTmFtZU9mKHBpZWNlQXRLZXkpICYmICghZmFkaW5nIHx8ICFlbC5jZ0ZhZGluZykpIHtcbiAgICAgICAgICAgICAgICAgICAgc2FtZVBpZWNlcy5hZGQoayk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZmFkaW5nICYmIGVsUGllY2VOYW1lID09PSBwaWVjZU5hbWVPZihmYWRpbmcpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlbC5jbGFzc0xpc3QuYWRkKCdmYWRpbmcnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsLmNnRmFkaW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFwcGVuZFZhbHVlKG1vdmVkUGllY2VzLCBlbFBpZWNlTmFtZSwgZWwpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgYXBwZW5kVmFsdWUobW92ZWRQaWVjZXMsIGVsUGllY2VOYW1lLCBlbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZiAoaXNTcXVhcmVOb2RlKGVsKSkge1xuICAgICAgICAgICAgY29uc3QgY24gPSBlbC5jbGFzc05hbWU7XG4gICAgICAgICAgICBpZiAoc3F1YXJlcy5nZXQoaykgPT09IGNuKVxuICAgICAgICAgICAgICAgIHNhbWVTcXVhcmVzLmFkZChrKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICBhcHBlbmRWYWx1ZShtb3ZlZFNxdWFyZXMsIGNuLCBlbCk7XG4gICAgICAgIH1cbiAgICAgICAgZWwgPSBlbC5uZXh0U2libGluZztcbiAgICB9XG4gICAgZm9yIChjb25zdCBbc2ssIGNsYXNzTmFtZV0gb2Ygc3F1YXJlcykge1xuICAgICAgICBpZiAoIXNhbWVTcXVhcmVzLmhhcyhzaykpIHtcbiAgICAgICAgICAgIHNNdmRzZXQgPSBtb3ZlZFNxdWFyZXMuZ2V0KGNsYXNzTmFtZSk7XG4gICAgICAgICAgICBzTXZkID0gc012ZHNldCAmJiBzTXZkc2V0LnBvcCgpO1xuICAgICAgICAgICAgY29uc3QgdHJhbnNsYXRpb24gPSBwb3NUb1RyYW5zbGF0ZSh1dGlsXzEua2V5MnBvcyhzayksIGFzV2hpdGUpO1xuICAgICAgICAgICAgaWYgKHNNdmQpIHtcbiAgICAgICAgICAgICAgICBzTXZkLmNnS2V5ID0gc2s7XG4gICAgICAgICAgICAgICAgdHJhbnNsYXRlKHNNdmQsIHRyYW5zbGF0aW9uKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNxdWFyZU5vZGUgPSB1dGlsXzEuY3JlYXRlRWwoJ3NxdWFyZScsIGNsYXNzTmFtZSk7XG4gICAgICAgICAgICAgICAgc3F1YXJlTm9kZS5jZ0tleSA9IHNrO1xuICAgICAgICAgICAgICAgIHRyYW5zbGF0ZShzcXVhcmVOb2RlLCB0cmFuc2xhdGlvbik7XG4gICAgICAgICAgICAgICAgYm9hcmRFbC5pbnNlcnRCZWZvcmUoc3F1YXJlTm9kZSwgYm9hcmRFbC5maXJzdENoaWxkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IFtrLCBwXSBvZiBwaWVjZXMpIHtcbiAgICAgICAgYW5pbSA9IGFuaW1zLmdldChrKTtcbiAgICAgICAgaWYgKCFzYW1lUGllY2VzLmhhcyhrKSkge1xuICAgICAgICAgICAgcE12ZHNldCA9IG1vdmVkUGllY2VzLmdldChwaWVjZU5hbWVPZihwKSk7XG4gICAgICAgICAgICBwTXZkID0gcE12ZHNldCAmJiBwTXZkc2V0LnBvcCgpO1xuICAgICAgICAgICAgaWYgKHBNdmQpIHtcbiAgICAgICAgICAgICAgICBwTXZkLmNnS2V5ID0gaztcbiAgICAgICAgICAgICAgICBpZiAocE12ZC5jZ0ZhZGluZykge1xuICAgICAgICAgICAgICAgICAgICBwTXZkLmNsYXNzTGlzdC5yZW1vdmUoJ2ZhZGluZycpO1xuICAgICAgICAgICAgICAgICAgICBwTXZkLmNnRmFkaW5nID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGNvbnN0IHBvcyA9IHV0aWxfMS5rZXkycG9zKGspO1xuICAgICAgICAgICAgICAgIGlmIChzLmFkZFBpZWNlWkluZGV4KVxuICAgICAgICAgICAgICAgICAgICBwTXZkLnN0eWxlLnpJbmRleCA9IHBvc1pJbmRleChwb3MsIGFzV2hpdGUpO1xuICAgICAgICAgICAgICAgIGlmIChhbmltKSB7XG4gICAgICAgICAgICAgICAgICAgIHBNdmQuY2dBbmltYXRpbmcgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBwTXZkLmNsYXNzTGlzdC5hZGQoJ2FuaW0nKTtcbiAgICAgICAgICAgICAgICAgICAgcG9zWzBdICs9IGFuaW1bMl07XG4gICAgICAgICAgICAgICAgICAgIHBvc1sxXSArPSBhbmltWzNdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cmFuc2xhdGUocE12ZCwgcG9zVG9UcmFuc2xhdGUocG9zLCBhc1doaXRlKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25zdCBwaWVjZU5hbWUgPSBwaWVjZU5hbWVPZihwKSwgcGllY2VOb2RlID0gdXRpbF8xLmNyZWF0ZUVsKCdwaWVjZScsIHBpZWNlTmFtZSksIHBvcyA9IHV0aWxfMS5rZXkycG9zKGspO1xuICAgICAgICAgICAgICAgIHBpZWNlTm9kZS5jZ1BpZWNlID0gcGllY2VOYW1lO1xuICAgICAgICAgICAgICAgIHBpZWNlTm9kZS5jZ0tleSA9IGs7XG4gICAgICAgICAgICAgICAgaWYgKGFuaW0pIHtcbiAgICAgICAgICAgICAgICAgICAgcGllY2VOb2RlLmNnQW5pbWF0aW5nID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgcG9zWzBdICs9IGFuaW1bMl07XG4gICAgICAgICAgICAgICAgICAgIHBvc1sxXSArPSBhbmltWzNdO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB0cmFuc2xhdGUocGllY2VOb2RlLCBwb3NUb1RyYW5zbGF0ZShwb3MsIGFzV2hpdGUpKTtcbiAgICAgICAgICAgICAgICBpZiAocy5hZGRQaWVjZVpJbmRleClcbiAgICAgICAgICAgICAgICAgICAgcGllY2VOb2RlLnN0eWxlLnpJbmRleCA9IHBvc1pJbmRleChwb3MsIGFzV2hpdGUpO1xuICAgICAgICAgICAgICAgIGJvYXJkRWwuYXBwZW5kQ2hpbGQocGllY2VOb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGNvbnN0IG5vZGVzIG9mIG1vdmVkUGllY2VzLnZhbHVlcygpKVxuICAgICAgICByZW1vdmVOb2RlcyhzLCBub2Rlcyk7XG4gICAgZm9yIChjb25zdCBub2RlcyBvZiBtb3ZlZFNxdWFyZXMudmFsdWVzKCkpXG4gICAgICAgIHJlbW92ZU5vZGVzKHMsIG5vZGVzKTtcbn1cbmV4cG9ydHMucmVuZGVyID0gcmVuZGVyO1xuZnVuY3Rpb24gdXBkYXRlQm91bmRzKHMpIHtcbiAgICBpZiAocy5kb20ucmVsYXRpdmUpXG4gICAgICAgIHJldHVybjtcbiAgICBjb25zdCBhc1doaXRlID0gYm9hcmRfMS53aGl0ZVBvdihzKSwgcG9zVG9UcmFuc2xhdGUgPSB1dGlsLnBvc1RvVHJhbnNsYXRlQWJzKHMuZG9tLmJvdW5kcygpKTtcbiAgICBsZXQgZWwgPSBzLmRvbS5lbGVtZW50cy5ib2FyZC5maXJzdENoaWxkO1xuICAgIHdoaWxlIChlbCkge1xuICAgICAgICBpZiAoKGlzUGllY2VOb2RlKGVsKSAmJiAhZWwuY2dBbmltYXRpbmcpIHx8IGlzU3F1YXJlTm9kZShlbCkpIHtcbiAgICAgICAgICAgIHV0aWwudHJhbnNsYXRlQWJzKGVsLCBwb3NUb1RyYW5zbGF0ZSh1dGlsXzEua2V5MnBvcyhlbC5jZ0tleSksIGFzV2hpdGUpKTtcbiAgICAgICAgfVxuICAgICAgICBlbCA9IGVsLm5leHRTaWJsaW5nO1xuICAgIH1cbn1cbmV4cG9ydHMudXBkYXRlQm91bmRzID0gdXBkYXRlQm91bmRzO1xuZnVuY3Rpb24gaXNQaWVjZU5vZGUoZWwpIHtcbiAgICByZXR1cm4gZWwudGFnTmFtZSA9PT0gJ1BJRUNFJztcbn1cbmZ1bmN0aW9uIGlzU3F1YXJlTm9kZShlbCkge1xuICAgIHJldHVybiBlbC50YWdOYW1lID09PSAnU1FVQVJFJztcbn1cbmZ1bmN0aW9uIHJlbW92ZU5vZGVzKHMsIG5vZGVzKSB7XG4gICAgZm9yIChjb25zdCBub2RlIG9mIG5vZGVzKVxuICAgICAgICBzLmRvbS5lbGVtZW50cy5ib2FyZC5yZW1vdmVDaGlsZChub2RlKTtcbn1cbmZ1bmN0aW9uIHBvc1pJbmRleChwb3MsIGFzV2hpdGUpIHtcbiAgICBsZXQgeiA9IDIgKyBwb3NbMV0gKiA4ICsgKDcgLSBwb3NbMF0pO1xuICAgIGlmIChhc1doaXRlKVxuICAgICAgICB6ID0gNjcgLSB6O1xuICAgIHJldHVybiB6ICsgJyc7XG59XG5mdW5jdGlvbiBwaWVjZU5hbWVPZihwaWVjZSkge1xuICAgIHJldHVybiBgJHtwaWVjZS5jb2xvcn0gJHtwaWVjZS5yb2xlfWA7XG59XG5mdW5jdGlvbiBjb21wdXRlU3F1YXJlQ2xhc3NlcyhzKSB7XG4gICAgdmFyIF9hO1xuICAgIGNvbnN0IHNxdWFyZXMgPSBuZXcgTWFwKCk7XG4gICAgaWYgKHMubGFzdE1vdmUgJiYgcy5oaWdobGlnaHQubGFzdE1vdmUpXG4gICAgICAgIGZvciAoY29uc3QgayBvZiBzLmxhc3RNb3ZlKSB7XG4gICAgICAgICAgICBhZGRTcXVhcmUoc3F1YXJlcywgaywgJ2xhc3QtbW92ZScpO1xuICAgICAgICB9XG4gICAgaWYgKHMuY2hlY2sgJiYgcy5oaWdobGlnaHQuY2hlY2spXG4gICAgICAgIGFkZFNxdWFyZShzcXVhcmVzLCBzLmNoZWNrLCAnY2hlY2snKTtcbiAgICBpZiAocy5zZWxlY3RlZCkge1xuICAgICAgICBhZGRTcXVhcmUoc3F1YXJlcywgcy5zZWxlY3RlZCwgJ3NlbGVjdGVkJyk7XG4gICAgICAgIGlmIChzLm1vdmFibGUuc2hvd0Rlc3RzKSB7XG4gICAgICAgICAgICBjb25zdCBkZXN0cyA9IChfYSA9IHMubW92YWJsZS5kZXN0cykgPT09IG51bGwgfHwgX2EgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9hLmdldChzLnNlbGVjdGVkKTtcbiAgICAgICAgICAgIGlmIChkZXN0cylcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGsgb2YgZGVzdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgYWRkU3F1YXJlKHNxdWFyZXMsIGssICdtb3ZlLWRlc3QnICsgKHMucGllY2VzLmhhcyhrKSA/ICcgb2MnIDogJycpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBjb25zdCBwRGVzdHMgPSBzLnByZW1vdmFibGUuZGVzdHM7XG4gICAgICAgICAgICBpZiAocERlc3RzKVxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgayBvZiBwRGVzdHMpIHtcbiAgICAgICAgICAgICAgICAgICAgYWRkU3F1YXJlKHNxdWFyZXMsIGssICdwcmVtb3ZlLWRlc3QnICsgKHMucGllY2VzLmhhcyhrKSA/ICcgb2MnIDogJycpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgY29uc3QgcHJlbW92ZSA9IHMucHJlbW92YWJsZS5jdXJyZW50O1xuICAgIGlmIChwcmVtb3ZlKVxuICAgICAgICBmb3IgKGNvbnN0IGsgb2YgcHJlbW92ZSlcbiAgICAgICAgICAgIGFkZFNxdWFyZShzcXVhcmVzLCBrLCAnY3VycmVudC1wcmVtb3ZlJyk7XG4gICAgZWxzZSBpZiAocy5wcmVkcm9wcGFibGUuY3VycmVudClcbiAgICAgICAgYWRkU3F1YXJlKHNxdWFyZXMsIHMucHJlZHJvcHBhYmxlLmN1cnJlbnQua2V5LCAnY3VycmVudC1wcmVtb3ZlJyk7XG4gICAgY29uc3QgbyA9IHMuZXhwbG9kaW5nO1xuICAgIGlmIChvKVxuICAgICAgICBmb3IgKGNvbnN0IGsgb2Ygby5rZXlzKVxuICAgICAgICAgICAgYWRkU3F1YXJlKHNxdWFyZXMsIGssICdleHBsb2RpbmcnICsgby5zdGFnZSk7XG4gICAgcmV0dXJuIHNxdWFyZXM7XG59XG5mdW5jdGlvbiBhZGRTcXVhcmUoc3F1YXJlcywga2V5LCBrbGFzcykge1xuICAgIGNvbnN0IGNsYXNzZXMgPSBzcXVhcmVzLmdldChrZXkpO1xuICAgIGlmIChjbGFzc2VzKVxuICAgICAgICBzcXVhcmVzLnNldChrZXksIGAke2NsYXNzZXN9ICR7a2xhc3N9YCk7XG4gICAgZWxzZVxuICAgICAgICBzcXVhcmVzLnNldChrZXksIGtsYXNzKTtcbn1cbmZ1bmN0aW9uIGFwcGVuZFZhbHVlKG1hcCwga2V5LCB2YWx1ZSkge1xuICAgIGNvbnN0IGFyciA9IG1hcC5nZXQoa2V5KTtcbiAgICBpZiAoYXJyKVxuICAgICAgICBhcnIucHVzaCh2YWx1ZSk7XG4gICAgZWxzZVxuICAgICAgICBtYXAuc2V0KGtleSwgW3ZhbHVlXSk7XG59XG4vLyMgc291cmNlTWFwcGluZ1VSTD1yZW5kZXIuanMubWFwIiwiXCJ1c2Ugc3RyaWN0XCI7XG5PYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgXCJfX2VzTW9kdWxlXCIsIHsgdmFsdWU6IHRydWUgfSk7XG5leHBvcnRzLmRlZmF1bHRzID0gdm9pZCAwO1xuY29uc3QgZmVuID0gcmVxdWlyZShcIi4vZmVuXCIpO1xuY29uc3QgdXRpbF8xID0gcmVxdWlyZShcIi4vdXRpbFwiKTtcbmZ1bmN0aW9uIGRlZmF1bHRzKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIHBpZWNlczogZmVuLnJlYWQoZmVuLmluaXRpYWwpLFxuICAgICAgICBvcmllbnRhdGlvbjogJ3doaXRlJyxcbiAgICAgICAgdHVybkNvbG9yOiAnd2hpdGUnLFxuICAgICAgICBjb29yZGluYXRlczogdHJ1ZSxcbiAgICAgICAgYXV0b0Nhc3RsZTogdHJ1ZSxcbiAgICAgICAgdmlld09ubHk6IGZhbHNlLFxuICAgICAgICBkaXNhYmxlQ29udGV4dE1lbnU6IGZhbHNlLFxuICAgICAgICByZXNpemFibGU6IHRydWUsXG4gICAgICAgIGFkZFBpZWNlWkluZGV4OiBmYWxzZSxcbiAgICAgICAgcGllY2VLZXk6IGZhbHNlLFxuICAgICAgICBoaWdobGlnaHQ6IHtcbiAgICAgICAgICAgIGxhc3RNb3ZlOiB0cnVlLFxuICAgICAgICAgICAgY2hlY2s6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIGFuaW1hdGlvbjoge1xuICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICAgIGR1cmF0aW9uOiAyMDAsXG4gICAgICAgIH0sXG4gICAgICAgIG1vdmFibGU6IHtcbiAgICAgICAgICAgIGZyZWU6IHRydWUsXG4gICAgICAgICAgICBjb2xvcjogJ2JvdGgnLFxuICAgICAgICAgICAgc2hvd0Rlc3RzOiB0cnVlLFxuICAgICAgICAgICAgZXZlbnRzOiB7fSxcbiAgICAgICAgICAgIHJvb2tDYXN0bGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHByZW1vdmFibGU6IHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICBzaG93RGVzdHM6IHRydWUsXG4gICAgICAgICAgICBjYXN0bGU6IHRydWUsXG4gICAgICAgICAgICBldmVudHM6IHt9LFxuICAgICAgICB9LFxuICAgICAgICBwcmVkcm9wcGFibGU6IHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IGZhbHNlLFxuICAgICAgICAgICAgZXZlbnRzOiB7fSxcbiAgICAgICAgfSxcbiAgICAgICAgZHJhZ2dhYmxlOiB7XG4gICAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgICAgZGlzdGFuY2U6IDMsXG4gICAgICAgICAgICBhdXRvRGlzdGFuY2U6IHRydWUsXG4gICAgICAgICAgICBzaG93R2hvc3Q6IHRydWUsXG4gICAgICAgICAgICBkZWxldGVPbkRyb3BPZmY6IGZhbHNlLFxuICAgICAgICB9LFxuICAgICAgICBkcm9wbW9kZToge1xuICAgICAgICAgICAgYWN0aXZlOiBmYWxzZSxcbiAgICAgICAgfSxcbiAgICAgICAgc2VsZWN0YWJsZToge1xuICAgICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdHM6IHtcbiAgICAgICAgICAgIGRyYWdnZWQ6ICEoJ29udG91Y2hzdGFydCcgaW4gd2luZG93KSxcbiAgICAgICAgfSxcbiAgICAgICAgZXZlbnRzOiB7fSxcbiAgICAgICAgZHJhd2FibGU6IHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgICB2aXNpYmxlOiB0cnVlLFxuICAgICAgICAgICAgZGVmYXVsdFNuYXBUb1ZhbGlkTW92ZTogdHJ1ZSxcbiAgICAgICAgICAgIGVyYXNlT25DbGljazogdHJ1ZSxcbiAgICAgICAgICAgIHNoYXBlczogW10sXG4gICAgICAgICAgICBhdXRvU2hhcGVzOiBbXSxcbiAgICAgICAgICAgIGJydXNoZXM6IHtcbiAgICAgICAgICAgICAgICBncmVlbjogeyBrZXk6ICdnJywgY29sb3I6ICcjMTU3ODFCJywgb3BhY2l0eTogMSwgbGluZVdpZHRoOiAxMCB9LFxuICAgICAgICAgICAgICAgIHJlZDogeyBrZXk6ICdyJywgY29sb3I6ICcjODgyMDIwJywgb3BhY2l0eTogMSwgbGluZVdpZHRoOiAxMCB9LFxuICAgICAgICAgICAgICAgIGJsdWU6IHsga2V5OiAnYicsIGNvbG9yOiAnIzAwMzA4OCcsIG9wYWNpdHk6IDEsIGxpbmVXaWR0aDogMTAgfSxcbiAgICAgICAgICAgICAgICB5ZWxsb3c6IHsga2V5OiAneScsIGNvbG9yOiAnI2U2OGYwMCcsIG9wYWNpdHk6IDEsIGxpbmVXaWR0aDogMTAgfSxcbiAgICAgICAgICAgICAgICBwYWxlQmx1ZTogeyBrZXk6ICdwYicsIGNvbG9yOiAnIzAwMzA4OCcsIG9wYWNpdHk6IDAuNCwgbGluZVdpZHRoOiAxNSB9LFxuICAgICAgICAgICAgICAgIHBhbGVHcmVlbjogeyBrZXk6ICdwZycsIGNvbG9yOiAnIzE1NzgxQicsIG9wYWNpdHk6IDAuNCwgbGluZVdpZHRoOiAxNSB9LFxuICAgICAgICAgICAgICAgIHBhbGVSZWQ6IHsga2V5OiAncHInLCBjb2xvcjogJyM4ODIwMjAnLCBvcGFjaXR5OiAwLjQsIGxpbmVXaWR0aDogMTUgfSxcbiAgICAgICAgICAgICAgICBwYWxlR3JleToge1xuICAgICAgICAgICAgICAgICAgICBrZXk6ICdwZ3InLFxuICAgICAgICAgICAgICAgICAgICBjb2xvcjogJyM0YTRhNGEnLFxuICAgICAgICAgICAgICAgICAgICBvcGFjaXR5OiAwLjM1LFxuICAgICAgICAgICAgICAgICAgICBsaW5lV2lkdGg6IDE1LFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgcGllY2VzOiB7XG4gICAgICAgICAgICAgICAgYmFzZVVybDogJ2h0dHBzOi8vbGljaGVzczEub3JnL2Fzc2V0cy9waWVjZS9jYnVybmV0dC8nLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHByZXZTdmdIYXNoOiAnJyxcbiAgICAgICAgfSxcbiAgICAgICAgaG9sZDogdXRpbF8xLnRpbWVyKCksXG4gICAgfTtcbn1cbmV4cG9ydHMuZGVmYXVsdHMgPSBkZWZhdWx0cztcbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXN0YXRlLmpzLm1hcCIsIlwidXNlIHN0cmljdFwiO1xuT2JqZWN0LmRlZmluZVByb3BlcnR5KGV4cG9ydHMsIFwiX19lc01vZHVsZVwiLCB7IHZhbHVlOiB0cnVlIH0pO1xuZXhwb3J0cy5zZXRBdHRyaWJ1dGVzID0gZXhwb3J0cy5yZW5kZXJTdmcgPSBleHBvcnRzLmNyZWF0ZUVsZW1lbnQgPSB2b2lkIDA7XG5jb25zdCB1dGlsXzEgPSByZXF1aXJlKFwiLi91dGlsXCIpO1xuZnVuY3Rpb24gY3JlYXRlRWxlbWVudCh0YWdOYW1lKSB7XG4gICAgcmV0dXJuIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnROUygnaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnLCB0YWdOYW1lKTtcbn1cbmV4cG9ydHMuY3JlYXRlRWxlbWVudCA9IGNyZWF0ZUVsZW1lbnQ7XG5mdW5jdGlvbiByZW5kZXJTdmcoc3RhdGUsIHN2ZywgY3VzdG9tU3ZnKSB7XG4gICAgY29uc3QgZCA9IHN0YXRlLmRyYXdhYmxlLCBjdXJEID0gZC5jdXJyZW50LCBjdXIgPSBjdXJEICYmIGN1ckQubW91c2VTcSA/IGN1ckQgOiB1bmRlZmluZWQsIGFycm93RGVzdHMgPSBuZXcgTWFwKCksIGJvdW5kcyA9IHN0YXRlLmRvbS5ib3VuZHMoKTtcbiAgICBmb3IgKGNvbnN0IHMgb2YgZC5zaGFwZXMuY29uY2F0KGQuYXV0b1NoYXBlcykuY29uY2F0KGN1ciA/IFtjdXJdIDogW10pKSB7XG4gICAgICAgIGlmIChzLmRlc3QpXG4gICAgICAgICAgICBhcnJvd0Rlc3RzLnNldChzLmRlc3QsIChhcnJvd0Rlc3RzLmdldChzLmRlc3QpIHx8IDApICsgMSk7XG4gICAgfVxuICAgIGNvbnN0IHNoYXBlcyA9IGQuc2hhcGVzLmNvbmNhdChkLmF1dG9TaGFwZXMpLm1hcCgocykgPT4ge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgc2hhcGU6IHMsXG4gICAgICAgICAgICBjdXJyZW50OiBmYWxzZSxcbiAgICAgICAgICAgIGhhc2g6IHNoYXBlSGFzaChzLCBhcnJvd0Rlc3RzLCBmYWxzZSwgYm91bmRzKSxcbiAgICAgICAgfTtcbiAgICB9KTtcbiAgICBpZiAoY3VyKVxuICAgICAgICBzaGFwZXMucHVzaCh7XG4gICAgICAgICAgICBzaGFwZTogY3VyLFxuICAgICAgICAgICAgY3VycmVudDogdHJ1ZSxcbiAgICAgICAgICAgIGhhc2g6IHNoYXBlSGFzaChjdXIsIGFycm93RGVzdHMsIHRydWUsIGJvdW5kcyksXG4gICAgICAgIH0pO1xuICAgIGNvbnN0IGZ1bGxIYXNoID0gc2hhcGVzLm1hcChzYyA9PiBzYy5oYXNoKS5qb2luKCc7Jyk7XG4gICAgaWYgKGZ1bGxIYXNoID09PSBzdGF0ZS5kcmF3YWJsZS5wcmV2U3ZnSGFzaClcbiAgICAgICAgcmV0dXJuO1xuICAgIHN0YXRlLmRyYXdhYmxlLnByZXZTdmdIYXNoID0gZnVsbEhhc2g7XG4gICAgY29uc3QgZGVmc0VsID0gc3ZnLnF1ZXJ5U2VsZWN0b3IoJ2RlZnMnKTtcbiAgICBjb25zdCBzaGFwZXNFbCA9IHN2Zy5xdWVyeVNlbGVjdG9yKCdnJyk7XG4gICAgY29uc3QgY3VzdG9tU3Znc0VsID0gY3VzdG9tU3ZnLnF1ZXJ5U2VsZWN0b3IoJ2cnKTtcbiAgICBzeW5jRGVmcyhkLCBzaGFwZXMsIGRlZnNFbCk7XG4gICAgc3luY1NoYXBlcyhzdGF0ZSwgc2hhcGVzLmZpbHRlcihzID0+ICFzLnNoYXBlLmN1c3RvbVN2ZyksIGQuYnJ1c2hlcywgYXJyb3dEZXN0cywgc2hhcGVzRWwpO1xuICAgIHN5bmNTaGFwZXMoc3RhdGUsIHNoYXBlcy5maWx0ZXIocyA9PiBzLnNoYXBlLmN1c3RvbVN2ZyksIGQuYnJ1c2hlcywgYXJyb3dEZXN0cywgY3VzdG9tU3Znc0VsKTtcbn1cbmV4cG9ydHMucmVuZGVyU3ZnID0gcmVuZGVyU3ZnO1xuZnVuY3Rpb24gc3luY0RlZnMoZCwgc2hhcGVzLCBkZWZzRWwpIHtcbiAgICBjb25zdCBicnVzaGVzID0gbmV3IE1hcCgpO1xuICAgIGxldCBicnVzaDtcbiAgICBmb3IgKGNvbnN0IHMgb2Ygc2hhcGVzKSB7XG4gICAgICAgIGlmIChzLnNoYXBlLmRlc3QpIHtcbiAgICAgICAgICAgIGJydXNoID0gZC5icnVzaGVzW3Muc2hhcGUuYnJ1c2hdO1xuICAgICAgICAgICAgaWYgKHMuc2hhcGUubW9kaWZpZXJzKVxuICAgICAgICAgICAgICAgIGJydXNoID0gbWFrZUN1c3RvbUJydXNoKGJydXNoLCBzLnNoYXBlLm1vZGlmaWVycyk7XG4gICAgICAgICAgICBicnVzaGVzLnNldChicnVzaC5rZXksIGJydXNoKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBrZXlzSW5Eb20gPSBuZXcgU2V0KCk7XG4gICAgbGV0IGVsID0gZGVmc0VsLmZpcnN0Q2hpbGQ7XG4gICAgd2hpbGUgKGVsKSB7XG4gICAgICAgIGtleXNJbkRvbS5hZGQoZWwuZ2V0QXR0cmlidXRlKCdjZ0tleScpKTtcbiAgICAgICAgZWwgPSBlbC5uZXh0U2libGluZztcbiAgICB9XG4gICAgZm9yIChjb25zdCBba2V5LCBicnVzaF0gb2YgYnJ1c2hlcy5lbnRyaWVzKCkpIHtcbiAgICAgICAgaWYgKCFrZXlzSW5Eb20uaGFzKGtleSkpXG4gICAgICAgICAgICBkZWZzRWwuYXBwZW5kQ2hpbGQocmVuZGVyTWFya2VyKGJydXNoKSk7XG4gICAgfVxufVxuZnVuY3Rpb24gc3luY1NoYXBlcyhzdGF0ZSwgc2hhcGVzLCBicnVzaGVzLCBhcnJvd0Rlc3RzLCByb290KSB7XG4gICAgY29uc3QgYm91bmRzID0gc3RhdGUuZG9tLmJvdW5kcygpLCBoYXNoZXNJbkRvbSA9IG5ldyBNYXAoKSwgdG9SZW1vdmUgPSBbXTtcbiAgICBmb3IgKGNvbnN0IHNjIG9mIHNoYXBlcylcbiAgICAgICAgaGFzaGVzSW5Eb20uc2V0KHNjLmhhc2gsIGZhbHNlKTtcbiAgICBsZXQgZWwgPSByb290LmZpcnN0Q2hpbGQsIGVsSGFzaDtcbiAgICB3aGlsZSAoZWwpIHtcbiAgICAgICAgZWxIYXNoID0gZWwuZ2V0QXR0cmlidXRlKCdjZ0hhc2gnKTtcbiAgICAgICAgaWYgKGhhc2hlc0luRG9tLmhhcyhlbEhhc2gpKVxuICAgICAgICAgICAgaGFzaGVzSW5Eb20uc2V0KGVsSGFzaCwgdHJ1ZSk7XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIHRvUmVtb3ZlLnB1c2goZWwpO1xuICAgICAgICBlbCA9IGVsLm5leHRTaWJsaW5nO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGVsIG9mIHRvUmVtb3ZlKVxuICAgICAgICByb290LnJlbW92ZUNoaWxkKGVsKTtcbiAgICBmb3IgKGNvbnN0IHNjIG9mIHNoYXBlcykge1xuICAgICAgICBpZiAoIWhhc2hlc0luRG9tLmdldChzYy5oYXNoKSlcbiAgICAgICAgICAgIHJvb3QuYXBwZW5kQ2hpbGQocmVuZGVyU2hhcGUoc3RhdGUsIHNjLCBicnVzaGVzLCBhcnJvd0Rlc3RzLCBib3VuZHMpKTtcbiAgICB9XG59XG5mdW5jdGlvbiBzaGFwZUhhc2goeyBvcmlnLCBkZXN0LCBicnVzaCwgcGllY2UsIG1vZGlmaWVycywgY3VzdG9tU3ZnIH0sIGFycm93RGVzdHMsIGN1cnJlbnQsIGJvdW5kcykge1xuICAgIHJldHVybiBbXG4gICAgICAgIGJvdW5kcy53aWR0aCxcbiAgICAgICAgYm91bmRzLmhlaWdodCxcbiAgICAgICAgY3VycmVudCxcbiAgICAgICAgb3JpZyxcbiAgICAgICAgZGVzdCxcbiAgICAgICAgYnJ1c2gsXG4gICAgICAgIGRlc3QgJiYgKGFycm93RGVzdHMuZ2V0KGRlc3QpIHx8IDApID4gMSxcbiAgICAgICAgcGllY2UgJiYgcGllY2VIYXNoKHBpZWNlKSxcbiAgICAgICAgbW9kaWZpZXJzICYmIG1vZGlmaWVyc0hhc2gobW9kaWZpZXJzKSxcbiAgICAgICAgY3VzdG9tU3ZnICYmIGN1c3RvbVN2Z0hhc2goY3VzdG9tU3ZnKSxcbiAgICBdXG4gICAgICAgIC5maWx0ZXIoeCA9PiB4KVxuICAgICAgICAuam9pbignLCcpO1xufVxuZnVuY3Rpb24gcGllY2VIYXNoKHBpZWNlKSB7XG4gICAgcmV0dXJuIFtwaWVjZS5jb2xvciwgcGllY2Uucm9sZSwgcGllY2Uuc2NhbGVdLmZpbHRlcih4ID0+IHgpLmpvaW4oJywnKTtcbn1cbmZ1bmN0aW9uIG1vZGlmaWVyc0hhc2gobSkge1xuICAgIHJldHVybiAnJyArIChtLmxpbmVXaWR0aCB8fCAnJyk7XG59XG5mdW5jdGlvbiBjdXN0b21TdmdIYXNoKHMpIHtcbiAgICBsZXQgaCA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGggPSAoKChoIDw8IDUpIC0gaCkgKyBzLmNoYXJDb2RlQXQoaSkpID4+PiAwO1xuICAgIH1cbiAgICByZXR1cm4gJ2N1c3RvbS0nICsgaC50b1N0cmluZygpO1xufVxuZnVuY3Rpb24gcmVuZGVyU2hhcGUoc3RhdGUsIHsgc2hhcGUsIGN1cnJlbnQsIGhhc2ggfSwgYnJ1c2hlcywgYXJyb3dEZXN0cywgYm91bmRzKSB7XG4gICAgbGV0IGVsO1xuICAgIGlmIChzaGFwZS5jdXN0b21TdmcpIHtcbiAgICAgICAgY29uc3Qgb3JpZyA9IG9yaWVudCh1dGlsXzEua2V5MnBvcyhzaGFwZS5vcmlnKSwgc3RhdGUub3JpZW50YXRpb24pO1xuICAgICAgICBlbCA9IHJlbmRlckN1c3RvbVN2ZyhzaGFwZS5jdXN0b21TdmcsIG9yaWcsIGJvdW5kcyk7XG4gICAgfVxuICAgIGVsc2UgaWYgKHNoYXBlLnBpZWNlKVxuICAgICAgICBlbCA9IHJlbmRlclBpZWNlKHN0YXRlLmRyYXdhYmxlLnBpZWNlcy5iYXNlVXJsLCBvcmllbnQodXRpbF8xLmtleTJwb3Moc2hhcGUub3JpZyksIHN0YXRlLm9yaWVudGF0aW9uKSwgc2hhcGUucGllY2UsIGJvdW5kcyk7XG4gICAgZWxzZSB7XG4gICAgICAgIGNvbnN0IG9yaWcgPSBvcmllbnQodXRpbF8xLmtleTJwb3Moc2hhcGUub3JpZyksIHN0YXRlLm9yaWVudGF0aW9uKTtcbiAgICAgICAgaWYgKHNoYXBlLmRlc3QpIHtcbiAgICAgICAgICAgIGxldCBicnVzaCA9IGJydXNoZXNbc2hhcGUuYnJ1c2hdO1xuICAgICAgICAgICAgaWYgKHNoYXBlLm1vZGlmaWVycylcbiAgICAgICAgICAgICAgICBicnVzaCA9IG1ha2VDdXN0b21CcnVzaChicnVzaCwgc2hhcGUubW9kaWZpZXJzKTtcbiAgICAgICAgICAgIGVsID0gcmVuZGVyQXJyb3coYnJ1c2gsIG9yaWcsIG9yaWVudCh1dGlsXzEua2V5MnBvcyhzaGFwZS5kZXN0KSwgc3RhdGUub3JpZW50YXRpb24pLCBjdXJyZW50LCAoYXJyb3dEZXN0cy5nZXQoc2hhcGUuZGVzdCkgfHwgMCkgPiAxLCBib3VuZHMpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGVsID0gcmVuZGVyQ2lyY2xlKGJydXNoZXNbc2hhcGUuYnJ1c2hdLCBvcmlnLCBjdXJyZW50LCBib3VuZHMpO1xuICAgIH1cbiAgICBlbC5zZXRBdHRyaWJ1dGUoJ2NnSGFzaCcsIGhhc2gpO1xuICAgIHJldHVybiBlbDtcbn1cbmZ1bmN0aW9uIHJlbmRlckN1c3RvbVN2ZyhjdXN0b21TdmcsIHBvcywgYm91bmRzKSB7XG4gICAgY29uc3QgeyB3aWR0aCwgaGVpZ2h0IH0gPSBib3VuZHM7XG4gICAgY29uc3QgdyA9IHdpZHRoIC8gODtcbiAgICBjb25zdCBoID0gaGVpZ2h0IC8gODtcbiAgICBjb25zdCB4ID0gcG9zWzBdICogdztcbiAgICBjb25zdCB5ID0gKDcgLSBwb3NbMV0pICogaDtcbiAgICBjb25zdCBnID0gc2V0QXR0cmlidXRlcyhjcmVhdGVFbGVtZW50KCdnJyksIHsgdHJhbnNmb3JtOiBgdHJhbnNsYXRlKCR7eH0sJHt5fSlgIH0pO1xuICAgIGNvbnN0IHN2ZyA9IHNldEF0dHJpYnV0ZXMoY3JlYXRlRWxlbWVudCgnc3ZnJyksIHsgd2lkdGg6IHcsIGhlaWdodDogaCwgdmlld0JveDogJzAgMCAxMDAgMTAwJyB9KTtcbiAgICBnLmFwcGVuZENoaWxkKHN2Zyk7XG4gICAgc3ZnLmlubmVySFRNTCA9IGN1c3RvbVN2ZztcbiAgICByZXR1cm4gZztcbn1cbmZ1bmN0aW9uIHJlbmRlckNpcmNsZShicnVzaCwgcG9zLCBjdXJyZW50LCBib3VuZHMpIHtcbiAgICBjb25zdCBvID0gcG9zMnB4KHBvcywgYm91bmRzKSwgd2lkdGhzID0gY2lyY2xlV2lkdGgoYm91bmRzKSwgcmFkaXVzID0gKGJvdW5kcy53aWR0aCArIGJvdW5kcy5oZWlnaHQpIC8gMzI7XG4gICAgcmV0dXJuIHNldEF0dHJpYnV0ZXMoY3JlYXRlRWxlbWVudCgnY2lyY2xlJyksIHtcbiAgICAgICAgc3Ryb2tlOiBicnVzaC5jb2xvcixcbiAgICAgICAgJ3N0cm9rZS13aWR0aCc6IHdpZHRoc1tjdXJyZW50ID8gMCA6IDFdLFxuICAgICAgICBmaWxsOiAnbm9uZScsXG4gICAgICAgIG9wYWNpdHk6IG9wYWNpdHkoYnJ1c2gsIGN1cnJlbnQpLFxuICAgICAgICBjeDogb1swXSxcbiAgICAgICAgY3k6IG9bMV0sXG4gICAgICAgIHI6IHJhZGl1cyAtIHdpZHRoc1sxXSAvIDIsXG4gICAgfSk7XG59XG5mdW5jdGlvbiByZW5kZXJBcnJvdyhicnVzaCwgb3JpZywgZGVzdCwgY3VycmVudCwgc2hvcnRlbiwgYm91bmRzKSB7XG4gICAgY29uc3QgbSA9IGFycm93TWFyZ2luKGJvdW5kcywgc2hvcnRlbiAmJiAhY3VycmVudCksIGEgPSBwb3MycHgob3JpZywgYm91bmRzKSwgYiA9IHBvczJweChkZXN0LCBib3VuZHMpLCBkeCA9IGJbMF0gLSBhWzBdLCBkeSA9IGJbMV0gLSBhWzFdLCBhbmdsZSA9IE1hdGguYXRhbjIoZHksIGR4KSwgeG8gPSBNYXRoLmNvcyhhbmdsZSkgKiBtLCB5byA9IE1hdGguc2luKGFuZ2xlKSAqIG07XG4gICAgcmV0dXJuIHNldEF0dHJpYnV0ZXMoY3JlYXRlRWxlbWVudCgnbGluZScpLCB7XG4gICAgICAgIHN0cm9rZTogYnJ1c2guY29sb3IsXG4gICAgICAgICdzdHJva2Utd2lkdGgnOiBsaW5lV2lkdGgoYnJ1c2gsIGN1cnJlbnQsIGJvdW5kcyksXG4gICAgICAgICdzdHJva2UtbGluZWNhcCc6ICdyb3VuZCcsXG4gICAgICAgICdtYXJrZXItZW5kJzogJ3VybCgjYXJyb3doZWFkLScgKyBicnVzaC5rZXkgKyAnKScsXG4gICAgICAgIG9wYWNpdHk6IG9wYWNpdHkoYnJ1c2gsIGN1cnJlbnQpLFxuICAgICAgICB4MTogYVswXSxcbiAgICAgICAgeTE6IGFbMV0sXG4gICAgICAgIHgyOiBiWzBdIC0geG8sXG4gICAgICAgIHkyOiBiWzFdIC0geW8sXG4gICAgfSk7XG59XG5mdW5jdGlvbiByZW5kZXJQaWVjZShiYXNlVXJsLCBwb3MsIHBpZWNlLCBib3VuZHMpIHtcbiAgICBjb25zdCBvID0gcG9zMnB4KHBvcywgYm91bmRzKSwgc2l6ZSA9IChib3VuZHMud2lkdGggLyA4KSAqIChwaWVjZS5zY2FsZSB8fCAxKSwgbmFtZSA9IHBpZWNlLmNvbG9yWzBdICsgKHBpZWNlLnJvbGUgPT09ICdrbmlnaHQnID8gJ24nIDogcGllY2Uucm9sZVswXSkudG9VcHBlckNhc2UoKTtcbiAgICByZXR1cm4gc2V0QXR0cmlidXRlcyhjcmVhdGVFbGVtZW50KCdpbWFnZScpLCB7XG4gICAgICAgIGNsYXNzTmFtZTogYCR7cGllY2Uucm9sZX0gJHtwaWVjZS5jb2xvcn1gLFxuICAgICAgICB4OiBvWzBdIC0gc2l6ZSAvIDIsXG4gICAgICAgIHk6IG9bMV0gLSBzaXplIC8gMixcbiAgICAgICAgd2lkdGg6IHNpemUsXG4gICAgICAgIGhlaWdodDogc2l6ZSxcbiAgICAgICAgaHJlZjogYmFzZVVybCArIG5hbWUgKyAnLnN2ZycsXG4gICAgfSk7XG59XG5mdW5jdGlvbiByZW5kZXJNYXJrZXIoYnJ1c2gpIHtcbiAgICBjb25zdCBtYXJrZXIgPSBzZXRBdHRyaWJ1dGVzKGNyZWF0ZUVsZW1lbnQoJ21hcmtlcicpLCB7XG4gICAgICAgIGlkOiAnYXJyb3doZWFkLScgKyBicnVzaC5rZXksXG4gICAgICAgIG9yaWVudDogJ2F1dG8nLFxuICAgICAgICBtYXJrZXJXaWR0aDogNCxcbiAgICAgICAgbWFya2VySGVpZ2h0OiA4LFxuICAgICAgICByZWZYOiAyLjA1LFxuICAgICAgICByZWZZOiAyLjAxLFxuICAgIH0pO1xuICAgIG1hcmtlci5hcHBlbmRDaGlsZChzZXRBdHRyaWJ1dGVzKGNyZWF0ZUVsZW1lbnQoJ3BhdGgnKSwge1xuICAgICAgICBkOiAnTTAsMCBWNCBMMywyIFonLFxuICAgICAgICBmaWxsOiBicnVzaC5jb2xvcixcbiAgICB9KSk7XG4gICAgbWFya2VyLnNldEF0dHJpYnV0ZSgnY2dLZXknLCBicnVzaC5rZXkpO1xuICAgIHJldHVybiBtYXJrZXI7XG59XG5mdW5jdGlvbiBzZXRBdHRyaWJ1dGVzKGVsLCBhdHRycykge1xuICAgIGZvciAoY29uc3Qga2V5IGluIGF0dHJzKVxuICAgICAgICBlbC5zZXRBdHRyaWJ1dGUoa2V5LCBhdHRyc1trZXldKTtcbiAgICByZXR1cm4gZWw7XG59XG5leHBvcnRzLnNldEF0dHJpYnV0ZXMgPSBzZXRBdHRyaWJ1dGVzO1xuZnVuY3Rpb24gb3JpZW50KHBvcywgY29sb3IpIHtcbiAgICByZXR1cm4gY29sb3IgPT09ICd3aGl0ZScgPyBwb3MgOiBbNyAtIHBvc1swXSwgNyAtIHBvc1sxXV07XG59XG5mdW5jdGlvbiBtYWtlQ3VzdG9tQnJ1c2goYmFzZSwgbW9kaWZpZXJzKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgY29sb3I6IGJhc2UuY29sb3IsXG4gICAgICAgIG9wYWNpdHk6IE1hdGgucm91bmQoYmFzZS5vcGFjaXR5ICogMTApIC8gMTAsXG4gICAgICAgIGxpbmVXaWR0aDogTWF0aC5yb3VuZChtb2RpZmllcnMubGluZVdpZHRoIHx8IGJhc2UubGluZVdpZHRoKSxcbiAgICAgICAga2V5OiBbYmFzZS5rZXksIG1vZGlmaWVycy5saW5lV2lkdGhdLmZpbHRlcih4ID0+IHgpLmpvaW4oJycpLFxuICAgIH07XG59XG5mdW5jdGlvbiBjaXJjbGVXaWR0aChib3VuZHMpIHtcbiAgICBjb25zdCBiYXNlID0gYm91bmRzLndpZHRoIC8gNTEyO1xuICAgIHJldHVybiBbMyAqIGJhc2UsIDQgKiBiYXNlXTtcbn1cbmZ1bmN0aW9uIGxpbmVXaWR0aChicnVzaCwgY3VycmVudCwgYm91bmRzKSB7XG4gICAgcmV0dXJuICgoKGJydXNoLmxpbmVXaWR0aCB8fCAxMCkgKiAoY3VycmVudCA/IDAuODUgOiAxKSkgLyA1MTIpICogYm91bmRzLndpZHRoO1xufVxuZnVuY3Rpb24gb3BhY2l0eShicnVzaCwgY3VycmVudCkge1xuICAgIHJldHVybiAoYnJ1c2gub3BhY2l0eSB8fCAxKSAqIChjdXJyZW50ID8gMC45IDogMSk7XG59XG5mdW5jdGlvbiBhcnJvd01hcmdpbihib3VuZHMsIHNob3J0ZW4pIHtcbiAgICByZXR1cm4gKChzaG9ydGVuID8gMjAgOiAxMCkgLyA1MTIpICogYm91bmRzLndpZHRoO1xufVxuZnVuY3Rpb24gcG9zMnB4KHBvcywgYm91bmRzKSB7XG4gICAgcmV0dXJuIFsoKHBvc1swXSArIDAuNSkgKiBib3VuZHMud2lkdGgpIC8gOCwgKCg3LjUgLSBwb3NbMV0pICogYm91bmRzLmhlaWdodCkgLyA4XTtcbn1cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPXN2Zy5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmV4cG9ydHMucmFua3MgPSBleHBvcnRzLmZpbGVzID0gZXhwb3J0cy5jb2xvcnMgPSB2b2lkIDA7XG5leHBvcnRzLmNvbG9ycyA9IFsnd2hpdGUnLCAnYmxhY2snXTtcbmV4cG9ydHMuZmlsZXMgPSBbJ2EnLCAnYicsICdjJywgJ2QnLCAnZScsICdmJywgJ2cnLCAnaCddO1xuZXhwb3J0cy5yYW5rcyA9IFsnMScsICcyJywgJzMnLCAnNCcsICc1JywgJzYnLCAnNycsICc4J107XG4vLyMgc291cmNlTWFwcGluZ1VSTD10eXBlcy5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmV4cG9ydHMuY29tcHV0ZVNxdWFyZUNlbnRlciA9IGV4cG9ydHMuY3JlYXRlRWwgPSBleHBvcnRzLmlzUmlnaHRCdXR0b24gPSBleHBvcnRzLmV2ZW50UG9zaXRpb24gPSBleHBvcnRzLnNldFZpc2libGUgPSBleHBvcnRzLnRyYW5zbGF0ZVJlbCA9IGV4cG9ydHMudHJhbnNsYXRlQWJzID0gZXhwb3J0cy5wb3NUb1RyYW5zbGF0ZVJlbCA9IGV4cG9ydHMucG9zVG9UcmFuc2xhdGVBYnMgPSBleHBvcnRzLnNhbWVQaWVjZSA9IGV4cG9ydHMuZGlzdGFuY2VTcSA9IGV4cG9ydHMub3Bwb3NpdGUgPSBleHBvcnRzLnRpbWVyID0gZXhwb3J0cy5tZW1vID0gZXhwb3J0cy5hbGxQb3MgPSBleHBvcnRzLmtleTJwb3MgPSBleHBvcnRzLnBvczJrZXkgPSBleHBvcnRzLmFsbEtleXMgPSBleHBvcnRzLmludlJhbmtzID0gdm9pZCAwO1xuY29uc3QgY2cgPSByZXF1aXJlKFwiLi90eXBlc1wiKTtcbmV4cG9ydHMuaW52UmFua3MgPSBbLi4uY2cucmFua3NdLnJldmVyc2UoKTtcbmV4cG9ydHMuYWxsS2V5cyA9IEFycmF5LnByb3RvdHlwZS5jb25jYXQoLi4uY2cuZmlsZXMubWFwKGMgPT4gY2cucmFua3MubWFwKHIgPT4gYyArIHIpKSk7XG5jb25zdCBwb3Mya2V5ID0gKHBvcykgPT4gZXhwb3J0cy5hbGxLZXlzWzggKiBwb3NbMF0gKyBwb3NbMV1dO1xuZXhwb3J0cy5wb3Mya2V5ID0gcG9zMmtleTtcbmNvbnN0IGtleTJwb3MgPSAoaykgPT4gW2suY2hhckNvZGVBdCgwKSAtIDk3LCBrLmNoYXJDb2RlQXQoMSkgLSA0OV07XG5leHBvcnRzLmtleTJwb3MgPSBrZXkycG9zO1xuZXhwb3J0cy5hbGxQb3MgPSBleHBvcnRzLmFsbEtleXMubWFwKGV4cG9ydHMua2V5MnBvcyk7XG5mdW5jdGlvbiBtZW1vKGYpIHtcbiAgICBsZXQgdjtcbiAgICBjb25zdCByZXQgPSAoKSA9PiB7XG4gICAgICAgIGlmICh2ID09PSB1bmRlZmluZWQpXG4gICAgICAgICAgICB2ID0gZigpO1xuICAgICAgICByZXR1cm4gdjtcbiAgICB9O1xuICAgIHJldC5jbGVhciA9ICgpID0+IHtcbiAgICAgICAgdiA9IHVuZGVmaW5lZDtcbiAgICB9O1xuICAgIHJldHVybiByZXQ7XG59XG5leHBvcnRzLm1lbW8gPSBtZW1vO1xuY29uc3QgdGltZXIgPSAoKSA9PiB7XG4gICAgbGV0IHN0YXJ0QXQ7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgc3RhcnQoKSB7XG4gICAgICAgICAgICBzdGFydEF0ID0gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgICAgIH0sXG4gICAgICAgIGNhbmNlbCgpIHtcbiAgICAgICAgICAgIHN0YXJ0QXQgPSB1bmRlZmluZWQ7XG4gICAgICAgIH0sXG4gICAgICAgIHN0b3AoKSB7XG4gICAgICAgICAgICBpZiAoIXN0YXJ0QXQpXG4gICAgICAgICAgICAgICAgcmV0dXJuIDA7XG4gICAgICAgICAgICBjb25zdCB0aW1lID0gcGVyZm9ybWFuY2Uubm93KCkgLSBzdGFydEF0O1xuICAgICAgICAgICAgc3RhcnRBdCA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgIHJldHVybiB0aW1lO1xuICAgICAgICB9LFxuICAgIH07XG59O1xuZXhwb3J0cy50aW1lciA9IHRpbWVyO1xuY29uc3Qgb3Bwb3NpdGUgPSAoYykgPT4gKGMgPT09ICd3aGl0ZScgPyAnYmxhY2snIDogJ3doaXRlJyk7XG5leHBvcnRzLm9wcG9zaXRlID0gb3Bwb3NpdGU7XG5jb25zdCBkaXN0YW5jZVNxID0gKHBvczEsIHBvczIpID0+IHtcbiAgICBjb25zdCBkeCA9IHBvczFbMF0gLSBwb3MyWzBdLCBkeSA9IHBvczFbMV0gLSBwb3MyWzFdO1xuICAgIHJldHVybiBkeCAqIGR4ICsgZHkgKiBkeTtcbn07XG5leHBvcnRzLmRpc3RhbmNlU3EgPSBkaXN0YW5jZVNxO1xuY29uc3Qgc2FtZVBpZWNlID0gKHAxLCBwMikgPT4gcDEucm9sZSA9PT0gcDIucm9sZSAmJiBwMS5jb2xvciA9PT0gcDIuY29sb3I7XG5leHBvcnRzLnNhbWVQaWVjZSA9IHNhbWVQaWVjZTtcbmNvbnN0IHBvc1RvVHJhbnNsYXRlQmFzZSA9IChwb3MsIGFzV2hpdGUsIHhGYWN0b3IsIHlGYWN0b3IpID0+IFtcbiAgICAoYXNXaGl0ZSA/IHBvc1swXSA6IDcgLSBwb3NbMF0pICogeEZhY3RvcixcbiAgICAoYXNXaGl0ZSA/IDcgLSBwb3NbMV0gOiBwb3NbMV0pICogeUZhY3Rvcixcbl07XG5jb25zdCBwb3NUb1RyYW5zbGF0ZUFicyA9IChib3VuZHMpID0+IHtcbiAgICBjb25zdCB4RmFjdG9yID0gYm91bmRzLndpZHRoIC8gOCwgeUZhY3RvciA9IGJvdW5kcy5oZWlnaHQgLyA4O1xuICAgIHJldHVybiAocG9zLCBhc1doaXRlKSA9PiBwb3NUb1RyYW5zbGF0ZUJhc2UocG9zLCBhc1doaXRlLCB4RmFjdG9yLCB5RmFjdG9yKTtcbn07XG5leHBvcnRzLnBvc1RvVHJhbnNsYXRlQWJzID0gcG9zVG9UcmFuc2xhdGVBYnM7XG5jb25zdCBwb3NUb1RyYW5zbGF0ZVJlbCA9IChwb3MsIGFzV2hpdGUpID0+IHBvc1RvVHJhbnNsYXRlQmFzZShwb3MsIGFzV2hpdGUsIDEwMCwgMTAwKTtcbmV4cG9ydHMucG9zVG9UcmFuc2xhdGVSZWwgPSBwb3NUb1RyYW5zbGF0ZVJlbDtcbmNvbnN0IHRyYW5zbGF0ZUFicyA9IChlbCwgcG9zKSA9PiB7XG4gICAgZWwuc3R5bGUudHJhbnNmb3JtID0gYHRyYW5zbGF0ZSgke3Bvc1swXX1weCwke3Bvc1sxXX1weClgO1xufTtcbmV4cG9ydHMudHJhbnNsYXRlQWJzID0gdHJhbnNsYXRlQWJzO1xuY29uc3QgdHJhbnNsYXRlUmVsID0gKGVsLCBwZXJjZW50cykgPT4ge1xuICAgIGVsLnN0eWxlLnRyYW5zZm9ybSA9IGB0cmFuc2xhdGUoJHtwZXJjZW50c1swXX0lLCR7cGVyY2VudHNbMV19JSlgO1xufTtcbmV4cG9ydHMudHJhbnNsYXRlUmVsID0gdHJhbnNsYXRlUmVsO1xuY29uc3Qgc2V0VmlzaWJsZSA9IChlbCwgdikgPT4ge1xuICAgIGVsLnN0eWxlLnZpc2liaWxpdHkgPSB2ID8gJ3Zpc2libGUnIDogJ2hpZGRlbic7XG59O1xuZXhwb3J0cy5zZXRWaXNpYmxlID0gc2V0VmlzaWJsZTtcbmNvbnN0IGV2ZW50UG9zaXRpb24gPSAoZSkgPT4ge1xuICAgIHZhciBfYTtcbiAgICBpZiAoZS5jbGllbnRYIHx8IGUuY2xpZW50WCA9PT0gMClcbiAgICAgICAgcmV0dXJuIFtlLmNsaWVudFgsIGUuY2xpZW50WV07XG4gICAgaWYgKChfYSA9IGUudGFyZ2V0VG91Y2hlcykgPT09IG51bGwgfHwgX2EgPT09IHZvaWQgMCA/IHZvaWQgMCA6IF9hWzBdKVxuICAgICAgICByZXR1cm4gW2UudGFyZ2V0VG91Y2hlc1swXS5jbGllbnRYLCBlLnRhcmdldFRvdWNoZXNbMF0uY2xpZW50WV07XG4gICAgcmV0dXJuO1xufTtcbmV4cG9ydHMuZXZlbnRQb3NpdGlvbiA9IGV2ZW50UG9zaXRpb247XG5jb25zdCBpc1JpZ2h0QnV0dG9uID0gKGUpID0+IGUuYnV0dG9ucyA9PT0gMiB8fCBlLmJ1dHRvbiA9PT0gMjtcbmV4cG9ydHMuaXNSaWdodEJ1dHRvbiA9IGlzUmlnaHRCdXR0b247XG5jb25zdCBjcmVhdGVFbCA9ICh0YWdOYW1lLCBjbGFzc05hbWUpID0+IHtcbiAgICBjb25zdCBlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQodGFnTmFtZSk7XG4gICAgaWYgKGNsYXNzTmFtZSlcbiAgICAgICAgZWwuY2xhc3NOYW1lID0gY2xhc3NOYW1lO1xuICAgIHJldHVybiBlbDtcbn07XG5leHBvcnRzLmNyZWF0ZUVsID0gY3JlYXRlRWw7XG5mdW5jdGlvbiBjb21wdXRlU3F1YXJlQ2VudGVyKGtleSwgYXNXaGl0ZSwgYm91bmRzKSB7XG4gICAgY29uc3QgcG9zID0gZXhwb3J0cy5rZXkycG9zKGtleSk7XG4gICAgaWYgKCFhc1doaXRlKSB7XG4gICAgICAgIHBvc1swXSA9IDcgLSBwb3NbMF07XG4gICAgICAgIHBvc1sxXSA9IDcgLSBwb3NbMV07XG4gICAgfVxuICAgIHJldHVybiBbXG4gICAgICAgIGJvdW5kcy5sZWZ0ICsgKGJvdW5kcy53aWR0aCAqIHBvc1swXSkgLyA4ICsgYm91bmRzLndpZHRoIC8gMTYsXG4gICAgICAgIGJvdW5kcy50b3AgKyAoYm91bmRzLmhlaWdodCAqICg3IC0gcG9zWzFdKSkgLyA4ICsgYm91bmRzLmhlaWdodCAvIDE2LFxuICAgIF07XG59XG5leHBvcnRzLmNvbXB1dGVTcXVhcmVDZW50ZXIgPSBjb21wdXRlU3F1YXJlQ2VudGVyO1xuLy8jIHNvdXJjZU1hcHBpbmdVUkw9dXRpbC5qcy5tYXAiLCJcInVzZSBzdHJpY3RcIjtcbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBcIl9fZXNNb2R1bGVcIiwgeyB2YWx1ZTogdHJ1ZSB9KTtcbmV4cG9ydHMucmVuZGVyV3JhcCA9IHZvaWQgMDtcbmNvbnN0IHV0aWxfMSA9IHJlcXVpcmUoXCIuL3V0aWxcIik7XG5jb25zdCB0eXBlc18xID0gcmVxdWlyZShcIi4vdHlwZXNcIik7XG5jb25zdCBzdmdfMSA9IHJlcXVpcmUoXCIuL3N2Z1wiKTtcbmZ1bmN0aW9uIHJlbmRlcldyYXAoZWxlbWVudCwgcywgcmVsYXRpdmUpIHtcbiAgICBlbGVtZW50LmlubmVySFRNTCA9ICcnO1xuICAgIGVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2ctd3JhcCcpO1xuICAgIGZvciAoY29uc3QgYyBvZiB0eXBlc18xLmNvbG9ycylcbiAgICAgICAgZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdvcmllbnRhdGlvbi0nICsgYywgcy5vcmllbnRhdGlvbiA9PT0gYyk7XG4gICAgZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdtYW5pcHVsYWJsZScsICFzLnZpZXdPbmx5KTtcbiAgICBjb25zdCBoZWxwZXIgPSB1dGlsXzEuY3JlYXRlRWwoJ2NnLWhlbHBlcicpO1xuICAgIGVsZW1lbnQuYXBwZW5kQ2hpbGQoaGVscGVyKTtcbiAgICBjb25zdCBjb250YWluZXIgPSB1dGlsXzEuY3JlYXRlRWwoJ2NnLWNvbnRhaW5lcicpO1xuICAgIGhlbHBlci5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuICAgIGNvbnN0IGJvYXJkID0gdXRpbF8xLmNyZWF0ZUVsKCdjZy1ib2FyZCcpO1xuICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChib2FyZCk7XG4gICAgbGV0IHN2ZztcbiAgICBsZXQgY3VzdG9tU3ZnO1xuICAgIGlmIChzLmRyYXdhYmxlLnZpc2libGUgJiYgIXJlbGF0aXZlKSB7XG4gICAgICAgIHN2ZyA9IHN2Z18xLnNldEF0dHJpYnV0ZXMoc3ZnXzEuY3JlYXRlRWxlbWVudCgnc3ZnJyksIHsgJ2NsYXNzJzogJ2NnLXNoYXBlcycgfSk7XG4gICAgICAgIHN2Zy5hcHBlbmRDaGlsZChzdmdfMS5jcmVhdGVFbGVtZW50KCdkZWZzJykpO1xuICAgICAgICBzdmcuYXBwZW5kQ2hpbGQoc3ZnXzEuY3JlYXRlRWxlbWVudCgnZycpKTtcbiAgICAgICAgY3VzdG9tU3ZnID0gc3ZnXzEuc2V0QXR0cmlidXRlcyhzdmdfMS5jcmVhdGVFbGVtZW50KCdzdmcnKSwgeyAnY2xhc3MnOiAnY2ctY3VzdG9tLXN2Z3MnIH0pO1xuICAgICAgICBjdXN0b21TdmcuYXBwZW5kQ2hpbGQoc3ZnXzEuY3JlYXRlRWxlbWVudCgnZycpKTtcbiAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHN2Zyk7XG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChjdXN0b21TdmcpO1xuICAgIH1cbiAgICBpZiAocy5jb29yZGluYXRlcykge1xuICAgICAgICBjb25zdCBvcmllbnRDbGFzcyA9IHMub3JpZW50YXRpb24gPT09ICdibGFjaycgPyAnIGJsYWNrJyA6ICcnO1xuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVyQ29vcmRzKHR5cGVzXzEucmFua3MsICdyYW5rcycgKyBvcmllbnRDbGFzcykpO1xuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVyQ29vcmRzKHR5cGVzXzEuZmlsZXMsICdmaWxlcycgKyBvcmllbnRDbGFzcykpO1xuICAgIH1cbiAgICBsZXQgZ2hvc3Q7XG4gICAgaWYgKHMuZHJhZ2dhYmxlLnNob3dHaG9zdCAmJiAhcmVsYXRpdmUpIHtcbiAgICAgICAgZ2hvc3QgPSB1dGlsXzEuY3JlYXRlRWwoJ3BpZWNlJywgJ2dob3N0Jyk7XG4gICAgICAgIHV0aWxfMS5zZXRWaXNpYmxlKGdob3N0LCBmYWxzZSk7XG4gICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChnaG9zdCk7XG4gICAgfVxuICAgIHJldHVybiB7XG4gICAgICAgIGJvYXJkLFxuICAgICAgICBjb250YWluZXIsXG4gICAgICAgIGdob3N0LFxuICAgICAgICBzdmcsXG4gICAgICAgIGN1c3RvbVN2ZyxcbiAgICB9O1xufVxuZXhwb3J0cy5yZW5kZXJXcmFwID0gcmVuZGVyV3JhcDtcbmZ1bmN0aW9uIHJlbmRlckNvb3JkcyhlbGVtcywgY2xhc3NOYW1lKSB7XG4gICAgY29uc3QgZWwgPSB1dGlsXzEuY3JlYXRlRWwoJ2Nvb3JkcycsIGNsYXNzTmFtZSk7XG4gICAgbGV0IGY7XG4gICAgZm9yIChjb25zdCBlbGVtIG9mIGVsZW1zKSB7XG4gICAgICAgIGYgPSB1dGlsXzEuY3JlYXRlRWwoJ2Nvb3JkJyk7XG4gICAgICAgIGYudGV4dENvbnRlbnQgPSBlbGVtO1xuICAgICAgICBlbC5hcHBlbmRDaGlsZChmKTtcbiAgICB9XG4gICAgcmV0dXJuIGVsO1xufVxuLy8jIHNvdXJjZU1hcHBpbmdVUkw9d3JhcC5qcy5tYXAiLCJpbXBvcnQge2Ryb3BOZXdQaWVjZX0gZnJvbSBcImNoZXNzZ3JvdW5kL2JvYXJkXCI7XG5pbXBvcnQge0NvbG9yLCBLZXksIFBpZWNlLCBSb2xlfSBmcm9tIFwiY2hlc3Nncm91bmQvdHlwZXNcIjtcbmltcG9ydCB7b3Bwb3NpdGV9IGZyb20gJ2NoZXNzZ3JvdW5kL3V0aWwnO1xuaW1wb3J0IHtUcmFpbENoZXNzU3RhdGUsIGdldE1vdmVzLCBzZXRQaWVjZVRyYWlsLCBNb3ZlLCBUcmFpbCwgdmFsaWRhdGVTdGF0ZX0gZnJvbSBcIi4vdHJhaWxjaGVzc1wiXG5cbmZ1bmN0aW9uIHJvbGVWYWx1ZShyb2xlOiBSb2xlKTogbnVtYmVyIHtcbiAgICByZXR1cm4ge1xuICAgICAgICAncGF3bic6IDEsXG4gICAgICAgICdrbmlnaHQnOiAzLFxuICAgICAgICAnYmlzaG9wJzogMyxcbiAgICAgICAgJ3Jvb2snOiA1LFxuICAgICAgICAncXVlZW4nOiA5XG4gICAgfSBbcm9sZV07XG59XG5cbmZ1bmN0aW9uIHBpY2tSYW5kb208VD4oYXJyYXk6IFRbXSk6IFQge1xuICAgIHJldHVybiBhcnJheVtNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBhcnJheS5sZW5ndGgpXTtcbn1cblxuZnVuY3Rpb24gc2h1ZmZsZUFycmF5PFQ+KGFycmF5OiBUW10pIHtcbiAgICBmb3IgKGxldCBpID0gYXJyYXkubGVuZ3RoIC0gMTsgaSA+IDA7IGktLSkge1xuICAgICAgICBjb25zdCBqID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogKGkgKyAxKSk7XG4gICAgICAgIGNvbnN0IHRlbXAgPSBhcnJheVtpXTtcbiAgICAgICAgYXJyYXlbaV0gPSBhcnJheVtqXTtcbiAgICAgICAgYXJyYXlbal0gPSB0ZW1wO1xuICAgIH1cbn1cblxuZnVuY3Rpb24gY29tcHV0ZU1vdmVXZWlnaHQoY29sb3I6IENvbG9yLCBvcHBvbmVudEF0dGFja3M6IFNldDxLZXk+LCBpc1BsYWNlZDogYm9vbGVhbiwgb2xkVHJhaWw6IFRyYWlsLCBtb3ZlOiBNb3ZlKTogbnVtYmVyIHtcbiAgICBsZXQgd2VpZ2h0ID0gMDtcbiAgICBjb25zdCBwaWVjZSA9IG1vdmUucGllY2U7XG4gICAgY29uc3Qgb3JpZyA9IG1vdmUudHJhaWxbMF07XG4gICAgY29uc3QgZGVzdCA9IG1vdmUudHJhaWxbbW92ZS50cmFpbC5sZW5ndGggLSAxXTtcbiAgICBpZiAobW92ZS5jYXB0dXJlcykge1xuICAgICAgICB3ZWlnaHQgKz0gcm9sZVZhbHVlKG1vdmUuY2FwdHVyZXMucGllY2Uucm9sZSkgKiAxMTtcbiAgICB9XG5cbiAgICBjb25zdCBbb3JpZ0F0dGFja2VkLCBkZXN0QXR0YWNrZWRdID0gW29wcG9uZW50QXR0YWNrcy5oYXMob3JpZyksIG9wcG9uZW50QXR0YWNrcy5oYXMoZGVzdCldO1xuICAgIGlmICgoaXNQbGFjZWQgfHwgIW9yaWdBdHRhY2tlZCkgJiYgZGVzdEF0dGFja2VkKSB7XG4gICAgICAgIHdlaWdodCAtPSByb2xlVmFsdWUocGllY2Uucm9sZSkgKiAxMDtcbiAgICB9IGVsc2UgaWYgKCFpc1BsYWNlZCAmJiBvcmlnQXR0YWNrZWQgJiYgIWRlc3RBdHRhY2tlZCkge1xuICAgICAgICB3ZWlnaHQgKz0gcm9sZVZhbHVlKHBpZWNlLnJvbGUpICogMTA7XG4gICAgfVxuXG4gICAgaWYgKCFkZXN0QXR0YWNrZWQpIHtcbiAgICAgICAgaWYgKHBpZWNlLnJvbGUgPT0gJ3Bhd24nICYmIG9sZFRyYWlsLmxlbmd0aCA+IDMpIHtcbiAgICAgICAgICAgIC8vIFBhd24gbW92ZSBzaG91bGQgaGF2ZSBtb3JlIHdlaWdodCBhcyBpdCBhcHByb2FjaGVzIHRoZSBlZGdlLlxuICAgICAgICAgICAgLy8gVGhlIHBhc3QgdHJhaWwgbGVuZ3RoIGFwcHJveGltYXRlcyBpdC5cbiAgICAgICAgICAgIHdlaWdodCArPSBvbGRUcmFpbC5sZW5ndGggKyAxO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgd2VpZ2h0ICs9IG1vdmUudHJhaWwubGVuZ3RoIC8gMjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmIChtb3ZlLmN1dHMpIHtcbiAgICAgICAgY29uc3Qgd2VpZ2h0U2lnbiA9IG1vdmUuY3V0cy5waWVjZS5jb2xvciA9PT0gY29sb3IgPyAtMSA6IDE7XG4gICAgICAgIGlmIChtb3ZlLmN1dHMuaXNFcmFzZWQpIHtcbiAgICAgICAgICAgIHdlaWdodCArPSB3ZWlnaHRTaWduICogMTAgKiByb2xlVmFsdWUobW92ZS5jdXRzLnBpZWNlLnJvbGUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgd2VpZ2h0ICs9IHdlaWdodFNpZ24gKiA1O1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB3ZWlnaHQ7XG59XG5cbmZ1bmN0aW9uIGdldEF0dGFja2VkU3F1YXJlcyhzdGF0ZTogVHJhaWxDaGVzc1N0YXRlLCBhdHRhY2tlckNvbG9yOiBDb2xvcik6IFNldDxLZXk+IHtcbiAgICBjb25zdCBhdHRhY2tlZFNxdWFyZXM6IFNldDxLZXk+ID0gbmV3IFNldCgpO1xuICAgIGNvbnN0IG1hcEFmdGVyTW92ZSA9IHN0YXRlLnN0YWdlLmtpbmQgPT0gJ01vdmVQbGFjZWRQaWVjZScgPyBzdGF0ZS5zdGFnZS5tb3Zlc01hcEJhY2t1cCA6IHN0YXRlLm1vdmVzTWFwO1xuICAgIGlmICghbWFwQWZ0ZXJNb3ZlKSByZXR1cm4gYXR0YWNrZWRTcXVhcmVzO1xuXG4gICAgZm9yIChjb25zdCBbcywgbW92ZXNdIG9mIG1hcEFmdGVyTW92ZSkge1xuICAgICAgICBpZiAoc3RhdGUuY2cuc3RhdGUucGllY2VzLmdldChzKT8uY29sb3IgIT09IGF0dGFja2VyQ29sb3IpIGNvbnRpbnVlO1xuICAgICAgICBmb3IgKGNvbnN0IG1vdmUgb2YgbW92ZXMpIHtcbiAgICAgICAgICAgIGF0dGFja2VkU3F1YXJlcy5hZGQobW92ZS50cmFpbFttb3ZlLnRyYWlsLmxlbmd0aCAtIDFdKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gYXR0YWNrZWRTcXVhcmVzO1xufVxuXG5mdW5jdGlvbiBnZXRXZWlnaHRlZE1vdmVzKHN0YXRlOiBUcmFpbENoZXNzU3RhdGUsIHJhbmRvbTogYm9vbGVhbik6IFdlaWdodGVkPHsgbW92ZTogTW92ZSB9PltdIHtcbiAgICBpZiAoIXN0YXRlLm1vdmVzTWFwIHx8IHN0YXRlLm1vdmVzTWFwLnNpemUgPT0gMCkgcmV0dXJuIFtdO1xuICAgIGlmIChyYW5kb20pIHtcbiAgICAgICAgY29uc3QgbW92ZXMgPSBwaWNrUmFuZG9tKFsuLi5zdGF0ZS5tb3Zlc01hcC52YWx1ZXMoKV0pO1xuICAgICAgICBjb25zdCBtb3ZlID0gcGlja1JhbmRvbShtb3Zlcyk7XG4gICAgICAgIHJldHVybiBbe21vdmUsIHdlaWdodDogMH1dXG4gICAgfVxuXG4gICAgY29uc3Qgb3Bwb25lbnRBdHRhY2tzID0gZ2V0QXR0YWNrZWRTcXVhcmVzKHN0YXRlLCBvcHBvc2l0ZShzdGF0ZS5jb2xvcikpO1xuICAgIGNvbnN0IHdlaWdodGVkTW92ZXM6IHsgbW92ZTogTW92ZSwgd2VpZ2h0OiBudW1iZXIgfVtdID0gW107XG4gICAgZm9yIChjb25zdCBtb3ZlcyBvZiBzdGF0ZS5tb3Zlc01hcC52YWx1ZXMoKSkge1xuICAgICAgICBjb25zdCB7cGllY2VJZCwgcGllY2V9ID0gbW92ZXNbMF07XG4gICAgICAgIGNvbnN0IHRyYWlsID0gc3RhdGUudHJhaWxzLmdldChwaWVjZUlkKSE7XG4gICAgICAgIGlmIChwaWVjZS5jb2xvciAhPT0gc3RhdGUuY29sb3IpIGNvbnRpbnVlO1xuICAgICAgICBmb3IgKGNvbnN0IG1vdmUgb2YgbW92ZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHdlaWdodCA9IGNvbXB1dGVNb3ZlV2VpZ2h0KHN0YXRlLmNvbG9yLCBvcHBvbmVudEF0dGFja3MsIGZhbHNlLCB0cmFpbCwgbW92ZSk7XG4gICAgICAgICAgICB3ZWlnaHRlZE1vdmVzLnB1c2goe21vdmUsIHdlaWdodH0pO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB3ZWlnaHRlZE1vdmVzO1xufVxuXG50eXBlIFdlaWdodGVkPFQ+ID0geyB3ZWlnaHQ6IG51bWJlciB9ICYgVDtcblxuZnVuY3Rpb24gc29ydFdlaWdodHM8VD4oYXJyOiBXZWlnaHRlZDxUPltdKTogV2VpZ2h0ZWQ8VD5bXSB7XG4gICAgcmV0dXJuIGFyci5zb3J0KChhLCBiKSA9PiBiLndlaWdodCAtIGEud2VpZ2h0KTtcbn1cblxuZnVuY3Rpb24gYmVzdFRyYWlsQ2hvaWNlKHN0YXRlOiBUcmFpbENoZXNzU3RhdGUpOiBUcmFpbCB7XG4gICAgY29uc3Qgc3RhZ2UgPSBzdGF0ZS5zdGFnZTtcbiAgICBpZiAoc3RhZ2Uua2luZCAhPT0gJ0Nob29zZVRyYWlsJykgdGhyb3cgbmV3IEVycm9yKCdDaG9vc2VUcmFpbCcpO1xuICAgIGNvbnN0IHBsYXllckF0dGFja3MgPSBnZXRBdHRhY2tlZFNxdWFyZXMoc3RhdGUsIHN0YXRlLmNvbG9yKTtcbiAgICBjb25zdCBvcHBvbmVudEF0dGFja3MgPSBnZXRBdHRhY2tlZFNxdWFyZXMoc3RhdGUsIG9wcG9zaXRlKHN0YXRlLmNvbG9yKSk7XG4gICAgY29uc3QgaXNQbGF5ZXJQaWVjZSA9IHN0YWdlLnBpZWNlLmNvbG9yID09PSBzdGF0ZS5jb2xvcjtcbiAgICBjb25zdCB3ZWlnaHRlZFRyYWlsczogV2VpZ2h0ZWQ8eyB0cmFpbDogVHJhaWwgfT5bXSA9IFtdO1xuXG4gICAgZm9yIChjb25zdCB0cmFpbCBvZiBzdGFnZS50cmFpbHMpIHtcbiAgICAgICAgbGV0IHdlaWdodCA9IDA7XG5cbiAgICAgICAgd2VpZ2h0ICs9IChpc1BsYXllclBpZWNlID8gMSA6IC0xKSAqIHRyYWlsLmxlbmd0aDtcbiAgICAgICAgY29uc3QgZGVzdCA9IHRyYWlsW3RyYWlsLmxlbmd0aCAtIDFdO1xuICAgICAgICBpZiAoaXNQbGF5ZXJQaWVjZSAmJiBvcHBvbmVudEF0dGFja3MuaGFzKGRlc3QpKSB7XG4gICAgICAgICAgICB3ZWlnaHQgLT0gcm9sZVZhbHVlKHN0YWdlLnBpZWNlLnJvbGUpICogMTA7XG4gICAgICAgIH0gZWxzZSBpZiAoIWlzUGxheWVyUGllY2UgJiYgcGxheWVyQXR0YWNrcy5oYXMoZGVzdCkpIHtcbiAgICAgICAgICAgIHdlaWdodCArPSByb2xlVmFsdWUoc3RhZ2UucGllY2Uucm9sZSkgKiAxMDtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHRlbXBQaWVjZUlkID0gLTE7XG4gICAgICAgIGNvbnN0IG1vdmVzID0gd2l0aFRlbXBTdGF0ZShzdGF0ZSwgc3RhdGUgPT4ge1xuICAgICAgICAgICAgc3RhdGUuY2cuc3RhdGUucGllY2VzLnNldChkZXN0LCBzdGFnZS5waWVjZSk7XG4gICAgICAgICAgICBzdGF0ZS5waWVjZUlkcy5zZXQoZGVzdCwgdGVtcFBpZWNlSWQpO1xuICAgICAgICAgICAgc2V0UGllY2VUcmFpbChzdGF0ZSwgdGVtcFBpZWNlSWQsIHRyYWlsKTtcbiAgICAgICAgICAgIHJldHVybiBnZXRNb3ZlcyhzdGF0ZSwgZGVzdCwgdHJ1ZSwgdHJ1ZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChtb3Zlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGxldCBmdXR1cmVNb3ZlV2VpZ2h0ID0gbW92ZXNcbiAgICAgICAgICAgICAgICAubWFwKG1vdmUgPT4gY29tcHV0ZU1vdmVXZWlnaHQoc3RhdGUuY29sb3IsIGlzUGxheWVyUGllY2UgPyBvcHBvbmVudEF0dGFja3MgOiBwbGF5ZXJBdHRhY2tzLCBmYWxzZSwgdHJhaWwsIG1vdmUpKVxuICAgICAgICAgICAgICAgIC5yZWR1Y2UoKHdlaWdodDEsIHdlaWdodDIpID0+IE1hdGgubWF4KHdlaWdodDEsIHdlaWdodDIpKSAvIDI7XG4gICAgICAgICAgICB3ZWlnaHQgKz0gaXNQbGF5ZXJQaWVjZSA/IGZ1dHVyZU1vdmVXZWlnaHQgOiAtZnV0dXJlTW92ZVdlaWdodDtcbiAgICAgICAgfVxuICAgICAgICB3ZWlnaHRlZFRyYWlscy5wdXNoKHt0cmFpbCwgd2VpZ2h0fSk7XG4gICAgfVxuICAgIHJldHVybiBzb3J0V2VpZ2h0cyh3ZWlnaHRlZFRyYWlscylbMF0udHJhaWw7XG59XG5cbmZ1bmN0aW9uIG1ha2VNb3ZlKHN0YXRlOiBUcmFpbENoZXNzU3RhdGUsIG1vdmU6IE1vdmUpIHtcbiAgICBzdGF0ZS5jZy5tb3ZlKG1vdmUudHJhaWxbMF0sIG1vdmUudHJhaWxbbW92ZS50cmFpbC5sZW5ndGggLSAxXSk7XG59XG5cbmZ1bmN0aW9uIHJhbmRvbVdlaWdodGVkPFQ+KGFycjogV2VpZ2h0ZWQ8VD5bXSwgdG9wOiBudW1iZXIpOiBUIHtcbiAgICBsZXQgcGlja3MgPSBzb3J0V2VpZ2h0cyhhcnIpLnNsaWNlKDAsIHRvcCk7XG4gICAgY29uc3Qgbm90QmFkUGlja3MgPSBwaWNrcy5maWx0ZXIoYSA9PiBhLndlaWdodCA+PSAwKTtcbiAgICBsZXQgd2VpZ2h0RnVuYyA9IHcgPT4gTWF0aC5hYnModyk7XG4gICAgaWYgKG5vdEJhZFBpY2tzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgcGlja3MgPSBub3RCYWRQaWNrcztcbiAgICAgICAgLy8gU3F1YXJlIHNrZXdzIHByb2JhYmlsaXR5IHRvd2FyZCBoaWdoZXIgd2VpZ2h0c1xuICAgICAgICB3ZWlnaHRGdW5jID0gdyA9PiB3ICogdztcbiAgICB9XG4gICAgY29uc3Qgd2VpZ2h0c1NxdWFyZWQgPSBwaWNrc1xuICAgICAgICAucmVkdWNlKChzLCBhKSA9PiBzICsgd2VpZ2h0RnVuYyhhLndlaWdodCksIDApO1xuICAgIGNvbnN0IHJhbmQgPSBNYXRoLnJhbmRvbSgpICogd2VpZ2h0c1NxdWFyZWQ7XG4gICAgbGV0IGNvdW50ZXIgPSAwO1xuICAgIGNvbnNvbGUubG9nKEpTT04uc3RyaW5naWZ5KHBpY2tzKSk7XG4gICAgZm9yIChjb25zdCBhIG9mIHBpY2tzKSB7XG4gICAgICAgIGNvdW50ZXIgKz0gd2VpZ2h0RnVuYyhhLndlaWdodCk7XG4gICAgICAgIGlmIChyYW5kIDw9IGNvdW50ZXIpIHJldHVybiBhO1xuICAgIH1cbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJyYW5kb21XZWlnaHRlZFwiKTtcbn1cblxuZnVuY3Rpb24gd2l0aFRlbXBTdGF0ZTxUPihzdGF0ZTogVHJhaWxDaGVzc1N0YXRlLCBmdW5jOiAoVHJhaWxDaGVzc1N0YXRlKSA9PiBUKTogVCB7XG4gICAgY29uc3QgdGVtcFN0YXRlID0ge1xuICAgICAgICAuLi5zdGF0ZSxcbiAgICAgICAgcGllY2VJZHM6IG5ldyBNYXAoc3RhdGUucGllY2VJZHMpLFxuICAgICAgICB0cmFpbE1hcDogbmV3IE1hcChzdGF0ZS50cmFpbE1hcCksXG4gICAgICAgIHRyYWlsczogbmV3IE1hcChzdGF0ZS50cmFpbHMpXG4gICAgfTtcbiAgICBjb25zdCBwaWVjZXNCYWNrdXAgPSBzdGF0ZS5jZy5zdGF0ZS5waWVjZXM7XG4gICAgc3RhdGUuY2cuc3RhdGUucGllY2VzID0gbmV3IE1hcChzdGF0ZS5jZy5zdGF0ZS5waWVjZXMpO1xuICAgIGNvbnN0IHJlc3VsdCA9IGZ1bmModGVtcFN0YXRlKTtcbiAgICBzdGF0ZS5jZy5zdGF0ZS5waWVjZXMgPSBwaWVjZXNCYWNrdXA7XG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gZ2V0V2VpZ2h0ZWRQbGFjZW1lbnQoc3RhdGU6IFRyYWlsQ2hlc3NTdGF0ZSwgcmFuZG9tOiBib29sZWFuKTogV2VpZ2h0ZWQ8eyBwbGFjZUF0OiBLZXksIHBpZWNlOiBQaWVjZSB9PltdIHtcbiAgICBjb25zdCBwaWVjZUJhbmsgPSBzdGF0ZS5waWVjZUJhbmsuZ2V0KHN0YXRlLmNvbG9yKSBhcyBNYXA8Um9sZSwgbnVtYmVyPjtcblxuICAgIGNvbnN0IGZyZWVTcXVhcmVzOiBLZXlbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgZmlsZSBvZiAnYWJjZGVmZ2gnKSB7XG4gICAgICAgIGZvciAoY29uc3QgcmFuayBvZiBbMSwgMiwgMywgNCwgNSwgNiwgNywgOF0pIHtcbiAgICAgICAgICAgIGNvbnN0IGtleSA9IGAke2ZpbGV9JHtyYW5rfWAgYXMgS2V5O1xuICAgICAgICAgICAgaWYgKCFzdGF0ZS50cmFpbE1hcC5oYXMoa2V5KSkge1xuICAgICAgICAgICAgICAgIGZyZWVTcXVhcmVzLnB1c2goa2V5KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHNodWZmbGVBcnJheShmcmVlU3F1YXJlcyk7XG5cbiAgICBjb25zdCB0ZW1wUGllY2VJZCA9IC0xO1xuICAgIGNvbnN0IGF2YWlsYWJsZVJvbGVzID0gWy4uLnBpZWNlQmFua10uZmlsdGVyKChbXywgY291bnRdKSA9PiBjb3VudCA+IDApLm1hcCgoW3JvbGVdKSA9PiByb2xlKTtcbiAgICBpZiAoYXZhaWxhYmxlUm9sZXMubGVuZ3RoID09PSAwKSByZXR1cm4gW107XG4gICAgY29uc3Qgd2VpZ2h0ZWRQbGFjZW1lbnRzOiB7IHBsYWNlQXQ6IEtleSwgcGllY2U6IFBpZWNlLCB3ZWlnaHQ6IG51bWJlciB9W10gPSBbXTtcblxuICAgIGxldCBhdHRlbXB0cyA9IDUwO1xuXG4gICAgY29uc3Qgb3Bwb25lbnRBdHRhY2tzID0gZ2V0QXR0YWNrZWRTcXVhcmVzKHN0YXRlLCBvcHBvc2l0ZShzdGF0ZS5jb2xvcikpO1xuXG4gICAgZm9yIChjb25zdCBrZXkgb2YgZnJlZVNxdWFyZXMpIHtcbiAgICAgICAgaWYgKGF0dGVtcHRzLS0gPT0gMCkgYnJlYWs7XG4gICAgICAgIGNvbnN0IHJvbGU6IFJvbGUgPSBwaWNrUmFuZG9tKGF2YWlsYWJsZVJvbGVzKTtcbiAgICAgICAgY29uc3QgcGllY2UgPSB7cm9sZSwgY29sb3I6IHN0YXRlLmNvbG9yfTtcblxuICAgICAgICBjb25zdCBtb3ZlczogV2VpZ2h0ZWQ8e21vdmU6IE1vdmV9PltdID0gd2l0aFRlbXBTdGF0ZShzdGF0ZSwgc3RhdGUgPT4ge1xuICAgICAgICAgICAgc3RhdGUuY2cuc3RhdGUucGllY2VzLnNldChrZXksIHBpZWNlKTtcbiAgICAgICAgICAgIHN0YXRlLnBpZWNlSWRzLnNldChrZXksIHRlbXBQaWVjZUlkKTtcbiAgICAgICAgICAgIGNvbnN0IG9sZFRyYWlsID0gW2tleV07XG4gICAgICAgICAgICBzZXRQaWVjZVRyYWlsKHN0YXRlLCB0ZW1wUGllY2VJZCwgb2xkVHJhaWwpO1xuICAgICAgICAgICAgcmV0dXJuIGdldE1vdmVzKHN0YXRlLCBrZXksIGZhbHNlLCBmYWxzZSlcbiAgICAgICAgICAgICAgICAubWFwKG1vdmUgPT4gKHtcbiAgICAgICAgICAgICAgICAgICAgbW92ZSxcbiAgICAgICAgICAgICAgICAgICAgd2VpZ2h0OiBjb21wdXRlTW92ZVdlaWdodChzdGF0ZS5jb2xvciwgb3Bwb25lbnRBdHRhY2tzLCB0cnVlLCBvbGRUcmFpbCwgbW92ZSlcbiAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChtb3Zlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgIGxldCB3ZWlnaHQgPSA1ICsgbW92ZXMubWFwKG1vdmUgPT4gbW92ZS53ZWlnaHQpXG4gICAgICAgICAgICAgICAgLnJlZHVjZSgod2VpZ2h0MSwgd2VpZ2h0MikgPT4gTWF0aC5tYXgod2VpZ2h0MSwgd2VpZ2h0MiksIDApO1xuICAgICAgICAgICAgY29uc3QgaW5CYW5rQ291bnQgPSBbLi4ucGllY2VCYW5rLnZhbHVlcygpXS5yZWR1Y2UoKGEsIGIpID0+IGEgKyBiLCAwKTtcbiAgICAgICAgICAgIGNvbnN0IG9uQm9hcmRDb3VudCA9IFsuLi5zdGF0ZS5jZy5zdGF0ZS5waWVjZXMudmFsdWVzKCldXG4gICAgICAgICAgICAgICAgLmZpbHRlcihwID0+IHAuY29sb3IgPT0gc3RhdGUuY29sb3IpLmxlbmd0aDtcbiAgICAgICAgICAgIGNvbnN0IHBpZWNlc011bHRpcGxpZXIgPSAxICsgaW5CYW5rQ291bnQgLyAob25Cb2FyZENvdW50ICsgaW5CYW5rQ291bnQpO1xuICAgICAgICAgICAgd2VpZ2h0ICo9IGZyZWVTcXVhcmVzLmxlbmd0aCAvIDY0ICogcGllY2VzTXVsdGlwbGllcjtcbiAgICAgICAgICAgIHdlaWdodGVkUGxhY2VtZW50cy5wdXNoKHtwbGFjZUF0OiBrZXksIHBpZWNlLCB3ZWlnaHR9KTtcbiAgICAgICAgICAgIGlmIChyYW5kb20pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gd2VpZ2h0ZWRQbGFjZW1lbnRzO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB3ZWlnaHRlZFBsYWNlbWVudHM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhaVBsYXkoc3RhdGU6IFRyYWlsQ2hlc3NTdGF0ZSwgcmFuZG9tOiBib29sZWFuKSB7XG4gICAgY29uc3Qgc3RhZ2UgPSBzdGF0ZS5zdGFnZTtcbiAgICB2YWxpZGF0ZVN0YXRlKHN0YXRlKTtcbiAgICBpZiAoc3RhZ2Uua2luZCA9PSAnTW92ZU9yUGxhY2UnKSB7XG4gICAgICAgIHR5cGUgV2VpZ2h0ZWRNb3ZlT3JQbGFjZW1lbnQgPSB7IHdlaWdodDogbnVtYmVyIH0gJiAoeyBwbGFjZUF0OiBLZXksIHBpZWNlOiBQaWVjZSB9IHwgeyBtb3ZlOiBNb3ZlIH0pO1xuICAgICAgICBsZXQgYWxsT3B0aW9uczogV2VpZ2h0ZWRNb3ZlT3JQbGFjZW1lbnRbXSA9IFtdO1xuICAgICAgICBhbGxPcHRpb25zID0gYWxsT3B0aW9ucy5jb25jYXQoZ2V0V2VpZ2h0ZWRQbGFjZW1lbnQoc3RhdGUsIHJhbmRvbSkpO1xuICAgICAgICBhbGxPcHRpb25zID0gYWxsT3B0aW9ucy5jb25jYXQoZ2V0V2VpZ2h0ZWRNb3ZlcyhzdGF0ZSwgcmFuZG9tKSk7XG4gICAgICAgIGFsbE9wdGlvbnMuc29ydCgoYSwgYikgPT4gYi53ZWlnaHQgLSBhLndlaWdodCk7XG4gICAgICAgIGlmIChhbGxPcHRpb25zLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgY2hvaWNlID0gcmFuZG9tID8gcGlja1JhbmRvbShhbGxPcHRpb25zKSA6IHJhbmRvbVdlaWdodGVkKGFsbE9wdGlvbnMsIDIpO1xuICAgICAgICB2YWxpZGF0ZVN0YXRlKHN0YXRlKTtcbiAgICAgICAgaWYgKCdwbGFjZUF0JyBpbiBjaG9pY2UpIHtcbiAgICAgICAgICAgIHN0YXRlLmNnLnN0YXRlLnBpZWNlcy5zZXQoJ2EwJywgY2hvaWNlLnBpZWNlKTtcbiAgICAgICAgICAgIGRyb3BOZXdQaWVjZShzdGF0ZS5jZy5zdGF0ZSwgJ2EwJywgY2hvaWNlLnBsYWNlQXQsIHRydWUpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbWFrZU1vdmUoc3RhdGUsIGNob2ljZS5tb3ZlKTtcbiAgICAgICAgfVxuICAgIH0gZWxzZSBpZiAoc3RhZ2Uua2luZCA9PSAnTW92ZVBsYWNlZFBpZWNlJykge1xuICAgICAgICBjb25zdCBtb3ZlcyA9IGdldFdlaWdodGVkTW92ZXMoc3RhdGUsIHJhbmRvbSk7XG4gICAgICAgIGNvbnN0IGNob2ljZSA9IHJhbmRvbSA/IHBpY2tSYW5kb20obW92ZXMpIDogcmFuZG9tV2VpZ2h0ZWQobW92ZXMsIDIpO1xuICAgICAgICB2YWxpZGF0ZVN0YXRlKHN0YXRlKTtcbiAgICAgICAgbWFrZU1vdmUoc3RhdGUsIGNob2ljZS5tb3ZlKTtcbiAgICB9IGVsc2UgaWYgKHN0YWdlLmtpbmQgPT0gJ0Nob29zZVRyYWlsJykge1xuICAgICAgICBjb25zdCB0cmFpbCA9IHJhbmRvbSA/IHBpY2tSYW5kb20oc3RhZ2UudHJhaWxzKSA6IGJlc3RUcmFpbENob2ljZShzdGF0ZSk7XG4gICAgICAgIC8vIFRoZSB0cmFpbCBhbHdheXMgbWluaW1hbCBsZW5ndGggMi5cbiAgICAgICAgLy8gVGhlIGZpcnN0IHNxdWFyZSBtYXkgYmUgc2hhcmVkIGJ5IGtuaWdodCB0cmFpbHMuXG4gICAgICAgIHN0YXRlLmNnLnNlbGVjdFNxdWFyZSh0cmFpbFsxXSk7XG4gICAgfVxuICAgIHN0YXRlLmNnLnN0YXRlLmRvbS5yZWRyYXcoKTtcbn1cbiIsImltcG9ydCB7VHJhaWxDaGVzc1N0YXRlLCBydW5UcmFpbENoZXNzfSBmcm9tIFwiLi90cmFpbGNoZXNzXCI7XG5pbXBvcnQge2FpUGxheX0gZnJvbSBcIi4vYWlcIjtcbmltcG9ydCAqIGFzIGNnIGZyb20gXCJjaGVzc2dyb3VuZC90eXBlc1wiO1xuaW1wb3J0IHtkcmFnTmV3UGllY2V9IGZyb20gXCJjaGVzc2dyb3VuZC9kcmFnXCI7XG5cbmV4cG9ydCBmdW5jdGlvbiBydW4oZWxlbWVudDogRWxlbWVudCkge1xuICAgIGxldCBzdGF0ZSA9IHJ1blRyYWlsQ2hlc3MoZWxlbWVudCk7XG5cbiAgICBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIoJ3RyYWlsY2hlc3NTdGFnZScsICgpID0+IG9uU3RhdGVVcGRhdGUoc3RhdGUpKTtcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY29udHJvbHMnKSFcbiAgICAgICAgLmFkZEV2ZW50TGlzdGVuZXIoJ2NoYW5nZScsICgpID0+IG9uU3RhdGVVcGRhdGUoc3RhdGUpKTtcbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY29udHJvbHMnKSFcbiAgICAgICAgLmFkZEV2ZW50TGlzdGVuZXIoJ3N1Ym1pdCcsIGUgPT4gZS5wcmV2ZW50RGVmYXVsdCgpKTtcblxuICAgIGZvciAoY29uc3QgaW5wdXROYW1lIG9mIFsnd2hpdGVQbGF5ZXInLCAnYmxhY2tQbGF5ZXInXSkge1xuICAgICAgICBjb25zdCBpbnB1dCA9IGRvY3VtZW50LmZvcm1zWydjb250cm9scyddIS5lbGVtZW50c1tpbnB1dE5hbWVdO1xuICAgICAgICBpZiAoIWlucHV0LnZhbHVlKSB7XG4gICAgICAgICAgICBpbnB1dC52YWx1ZSA9ICdodW1hbic7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdidXR0b24ucmVzZXQnKSFcbiAgICAgICAgLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgc3RhdGUuY2cuZGVzdHJveSgpO1xuICAgICAgICAgICAgc3RhdGUgPSBydW5UcmFpbENoZXNzKGVsZW1lbnQpO1xuICAgICAgICAgICAgb25TdGF0ZVVwZGF0ZShzdGF0ZSk7XG4gICAgICAgIH0pO1xuXG4gICAgZm9yIChjb25zdCBldlR5cGUgb2YgWydtb3VzZWRvd24nLCAndG91Y2hzdGFydCddKSB7XG4gICAgICAgIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JBbGwoJy5wb2NrZXQnKS5mb3JFYWNoKGVsID0+XG4gICAgICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKGV2VHlwZSwgKGU6IGNnLk1vdWNoRXZlbnQpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZS5idXR0b24gIT09IHVuZGVmaW5lZCAmJiBlLmJ1dHRvbiAhPT0gMCkgcmV0dXJuOyAvLyBvbmx5IHRvdWNoIG9yIGxlZnQgY2xpY2tcbiAgICAgICAgICAgICAgICBjb25zdCBlbCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50LFxuICAgICAgICAgICAgICAgICAgICByb2xlID0gZWwuZ2V0QXR0cmlidXRlKCdkYXRhLXJvbGUnKSBhcyBjZy5Sb2xlLFxuICAgICAgICAgICAgICAgICAgICBjb2xvciA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1jb2xvcicpIGFzIGNnLkNvbG9yLFxuICAgICAgICAgICAgICAgICAgICBjb3VudCA9IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1jb3VudCcpO1xuICAgICAgICAgICAgICAgIGlmICghcm9sZSB8fCAhY29sb3IgfHwgY291bnQgPT09ICcwJykgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGlmIChjb2xvciAhPT0gc3RhdGUuY29sb3IpIHJldHVybjtcbiAgICAgICAgICAgICAgICBlLnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICBkcmFnTmV3UGllY2Uoc3RhdGUuY2cuc3RhdGUsIHtjb2xvciwgcm9sZX0sIGUpO1xuICAgICAgICAgICAgfSkpO1xuICAgIH1cblxuICAgIG9uU3RhdGVVcGRhdGUoc3RhdGUpO1xufVxuXG5mdW5jdGlvbiBvblN0YXRlVXBkYXRlKHN0YXRlOiBUcmFpbENoZXNzU3RhdGUpIHtcbiAgICBjb25zdCBpbnB1dE5hbWUgPSBzdGF0ZS5jb2xvciA9PT0gJ3doaXRlJyA/ICd3aGl0ZVBsYXllcicgOiAnYmxhY2tQbGF5ZXInO1xuICAgIGNvbnN0IGlucHV0ID0gZG9jdW1lbnQuZm9ybXNbJ2NvbnRyb2xzJ10hLmVsZW1lbnRzW2lucHV0TmFtZV07XG5cblxuICAgIGlmIChpbnB1dC52YWx1ZSA9PT0gJ2FpJykge1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IGFpUGxheShzdGF0ZSwgZmFsc2UpLCAxMDAwKTtcbiAgICB9IGVsc2UgaWYgKGlucHV0LnZhbHVlID09PSAncmFuZG9tJykge1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IGFpUGxheShzdGF0ZSwgdHJ1ZSksIDEwMDApO1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgW2NvbG9yLCByb2xlc10gb2Ygc3RhdGUucGllY2VCYW5rKSB7XG4gICAgICAgIGZvciAoY29uc3QgW3JvbGUsIGNvdW50XSBvZiByb2xlcykge1xuICAgICAgICAgICAgY29uc3QgcGllY2VFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYC5wb2NrZXQgcGllY2UuJHtyb2xlfS4ke2NvbG9yfWApIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgICAgcGllY2VFbC5kYXRhc2V0LmNvdW50ID0gU3RyaW5nKGNvdW50KTtcbiAgICAgICAgfVxuICAgIH1cbn1cbiIsImltcG9ydCB7Q2hlc3Nncm91bmR9IGZyb20gJ2NoZXNzZ3JvdW5kJztcbmltcG9ydCB7RHJhd1NoYXBlfSBmcm9tICdjaGVzc2dyb3VuZC9kcmF3JztcbmltcG9ydCB7QXBpfSBmcm9tICdjaGVzc2dyb3VuZC9hcGknO1xuaW1wb3J0IHtrZXkycG9zLCBvcHBvc2l0ZSwgcG9zMmtleX0gZnJvbSAnY2hlc3Nncm91bmQvdXRpbCc7XG5pbXBvcnQge0tleSwgQ29sb3IsIFJvbGUsIFBpZWNlfSBmcm9tICdjaGVzc2dyb3VuZC90eXBlcyc7XG5pbXBvcnQge3ByZW1vdmV9IGZyb20gJ2NoZXNzZ3JvdW5kL3ByZW1vdmUnO1xuaW1wb3J0ICogYXMgY2cgZnJvbSBcImNoZXNzZ3JvdW5kL3R5cGVzXCI7XG5pbXBvcnQge2NyZWF0ZUVsZW1lbnQgYXMgY3JlYXRlU1ZHLCBzZXRBdHRyaWJ1dGVzfSBmcm9tICdjaGVzc2dyb3VuZC9zdmcnO1xuXG4vKlxuVE9ETzpcbjEuIE1vdmUgZmlsdGVyaW5nXG4gICAgYS4gRGlzYWJsZSBjYXB0dXJlIG9uIHRoZSBtb3ZlIG9mIGEgbmV3IHBpZWNlLiBET05FLlxuICAgIGIuIFJlc3RyaWN0IG1vdmVzIHdpdGggdHJhaWxzLiBET05FLlxuMi4gTG9naWMgb2YgY3V0dGluZyB0cmFpbHMuIERPTkUuXG4zLiBPdmVycmlkZSBtb3ZlcyBmb3IgcGF3bnMuIERPTkUuXG40LiBXaGVuIG1vdmluZyBhIHBsYWNlZCBwaWVjZSBkbyBub3QgbGV0IHRoZSBkZXN0cyBkaXNhcHBlYXIgd2hlbiBjbGlja2VkIG9uIGEgbm9uLXJlYWNoYWJsZSBzcXVhcmUuIERPTkUuXG41LiBLbmlnaHQgbG9zZXMgaXRzIHBhc3QgdHJhaWwuIERPTkVcbjYuIFBhd24gcHJvbW90aW9uLiBET05FXG43LiBSZW1vdmUganVzdCBwbGFjZWQgcGllY2Ugd2hlbiBjbGlja2VkIG9uIGl0LiBET05FLlxuOC4gQnVnIHdoZW4gY2Fubm90IGNob29zZSBhIHBpZWNlIHdoZW4gaXQgaXMgZGlzcGxheWVkIG9uIHRvcCBvZiBhIHBpZWNlIG9uIHRoZSBib2FyZC4gRE9ORS5cbjkuIERpc3BsYXkgY291bnRlciBvZiBhdmFpbGFibGUgcGllY2VzLiBET05FLlxuMTAuIERvIG5vdCBsZXQgYSBwaWVjZSB0aGF0IHdhcyBqdXN0IHBsYWNlZCB0byBjdXQgdGhlIHRyYWlscy4gRE9ORS5cbjExLiBBZnRlciBrbmlnaHQgY2FwdHVyZXMgYSBwaWVjZSBhbiBlcnJvciBoYXBwZW5zLiBET05FLlxuMTIuIFdoZW4gY3V0dGluZyBhbm90aGVyIHRyYWlsLCBzdGF0ZS5sYXN0TW92ZSBnZXRzIHNldCB0byBvbmUgb2YgaXRzIHBhdGhzLiBET05FLlxuMTMuIFVwZGF0ZSB0cmFpbHMgc3ZnIHdoZW4gYm91bmRzVXBkYXRlZC4gVE9ETzpcbjE0LiBTYXZlIGRlc3RzIGZvciB0YWtpbmcgYmFjayBwaWVjZS4gRE9ORS5cbjE1OiBQYXduIHByb21vdGlvbiBzaG91bGQgb25seSBoYXBwZW4gd2hlbiByZWFjaGluZyB0aGUgZnVydGhlc3QgZWRnZS4gRE9ORS5cbiAqL1xuXG5leHBvcnQgZnVuY3Rpb24gcnVuVHJhaWxDaGVzcyhlbCk6IFRyYWlsQ2hlc3NTdGF0ZSB7XG4gICAgY29uc3QgY2cgPSBDaGVzc2dyb3VuZChlbCwge1xuICAgICAgICBmZW46ICc4LzgvOC84LzgvOC84LzgnLFxuICAgICAgICBvcmllbnRhdGlvbjogJ3doaXRlJyxcbiAgICAgICAgbW92YWJsZToge1xuICAgICAgICAgICAgc2hvd0Rlc3RzOiB0cnVlLFxuICAgICAgICAgICAgY29sb3I6ICd3aGl0ZScsXG4gICAgICAgICAgICBmcmVlOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBwcmVtb3ZhYmxlOiB7XG4gICAgICAgICAgICBlbmFibGVkOiBmYWxzZVxuICAgICAgICB9LFxuICAgICAgICBkcmFnZ2FibGU6IHtcbiAgICAgICAgICAgIHNob3dHaG9zdDogdHJ1ZVxuICAgICAgICB9LFxuICAgICAgICBhbmltYXRpb246IHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHRydWVcbiAgICAgICAgfVxuICAgIH0pO1xuICAgIGxldCBzdGF0ZTogVHJhaWxDaGVzc1N0YXRlID0ge1xuICAgICAgICBjZzogY2csXG4gICAgICAgIHN0YWdlOiB7XG4gICAgICAgICAgICBraW5kOiAnTW92ZU9yUGxhY2UnXG4gICAgICAgIH0sXG4gICAgICAgIHBpZWNlSWRzOiBuZXcgTWFwPEtleSwgUGllY2VJZD4oKSxcbiAgICAgICAgdHJhaWxNYXA6IG5ldyBNYXA8S2V5LCBQaWVjZUlkPigpLFxuICAgICAgICB0cmFpbHM6IG5ldyBNYXA8UGllY2VJZCwgVHJhaWw+KCksXG4gICAgICAgIHBpZWNlQmFuazogbmV3IE1hcChbXG4gICAgICAgICAgICBbJ2JsYWNrJywgbWFrZVN0YXJ0aW5nUGllY2VzKCldLFxuICAgICAgICAgICAgWyd3aGl0ZScsIG1ha2VTdGFydGluZ1BpZWNlcygpXSxcbiAgICAgICAgXSksXG4gICAgICAgIHBpZWNlSWRDb3VudGVyOiAwLFxuICAgICAgICBjb2xvcjogJ3doaXRlJ1xuICAgIH07XG5cbiAgICBjZy5zZXQoe1xuICAgICAgICBldmVudHM6IHtcbiAgICAgICAgICAgIG1vdmU6IChvcmlnLCBkZXN0KSA9PiBvbk1vdmUoc3RhdGUsIG9yaWcsIGRlc3QpLFxuICAgICAgICAgICAgc2VsZWN0OiBrZXkgPT4gb25TZWxlY3Qoc3RhdGUsIGtleSksXG4gICAgICAgICAgICBkcm9wTmV3UGllY2U6IChwaWVjZSwga2V5KSA9PiBvbkRyb3BOZXdQaWVjZShzdGF0ZSwgcGllY2UsIGtleSksXG4gICAgICAgICAgICBjaGFuZ2U6ICgpID0+IG9uQ2hhbmdlKHN0YXRlKVxuICAgICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIHN0YXRlO1xufVxuXG4vLyBodHRwczovL2dpdGh1Yi5jb20vb3JuaWNhci9saWxhL2Jsb2IvbWFzdGVyL3VpL3JvdW5kL3NyYy9jcmF6eS9jcmF6eVZpZXcudHNcbmZ1bmN0aW9uIG9uRHJvcE5ld1BpZWNlKHN0YXRlOiBUcmFpbENoZXNzU3RhdGUsIHBpZWNlOiBQaWVjZSwga2V5OiBLZXkpIHtcbiAgICBjb25zdCBzdGFnZSA9IHN0YXRlLnN0YWdlO1xuICAgIGlmIChzdGFnZS5raW5kICE9ICdNb3ZlT3JQbGFjZScpIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoYFVuZXhwZWN0ZWQgc3RhZ2UgJHtzdGFnZS5raW5kfWApO1xuICAgIH1cbiAgICAvLyBBZnRlciBjYWxsaW5nIHRoZSBkcm9wIGxpc3RlbmVyLCBjaGVzc2dyb3VuZCBzZXRzIHRoZSBvcHBvc2l0ZSBjb2xvci5cbiAgICAvLyBXZSBuZWVkIHByZXNlcnZlIHRoZSB0dXJuIGNvbG9yIGFmdGVyIGRyb3BwaW5nIHRoZSBwaWVjZS5cbiAgICBzdGF0ZS5jZy5zdGF0ZS50dXJuQ29sb3IgPSBwaWVjZS5jb2xvcjtcblxuICAgIGlmIChzdGF0ZS50cmFpbE1hcC5oYXMoa2V5KSkge1xuICAgICAgICBzdGF0ZS5jZy5zdGF0ZS5waWVjZXMuZGVsZXRlKGtleSk7XG4gICAgICAgIHN0YXRlLmNnLnN0YXRlLmRvbS5yZWRyYXcoKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHBsYXllclBpZWNlcyA9IHN0YXRlLnBpZWNlQmFuay5nZXQocGllY2UuY29sb3IpITtcbiAgICBjb25zdCBuZXdQaWVjZUNvdW50ID0gcGxheWVyUGllY2VzLmdldChwaWVjZS5yb2xlKSEgLSAxO1xuICAgIGlmIChuZXdQaWVjZUNvdW50IDwgMCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHBsYXllclBpZWNlcy5zZXQocGllY2Uucm9sZSwgbmV3UGllY2VDb3VudCk7XG5cbiAgICBjb25zdCBwaWVjZUlkID0gc3RhdGUucGllY2VJZENvdW50ZXIrKztcbiAgICBwbGFjZVBpZWNlQ0coc3RhdGUsIHBpZWNlLCBrZXkpO1xuICAgIHN0YXRlLnBpZWNlSWRzLnNldChrZXksIHBpZWNlSWQpO1xuICAgIHNldFBpZWNlVHJhaWwoc3RhdGUsIHBpZWNlSWQsIFtrZXldKTtcbiAgICBjb25zdCBtb3Zlc01hcEJhY2t1cCA9IHN0YXRlLm1vdmVzTWFwIHx8IG5ldyBNYXAoKTtcbiAgICBjb25zdCBtb3ZlcyA9IGdldE1vdmVzKHN0YXRlLCBrZXksIGZhbHNlLCBmYWxzZSk7XG4gICAgc3RhdGUubW92ZXNNYXAgPSBuZXcgTWFwKFtba2V5LCBtb3Zlc11dKTtcbiAgICBzdGF0ZS5jZy5zZXQoe21vdmFibGU6IHtkZXN0czogbW92ZXNUb0Rlc3RzKHN0YXRlLm1vdmVzTWFwKX19KTtcblxuICAgIHNldFN0YWdlKHN0YXRlLCB7XG4gICAgICAgIGtpbmQ6ICdNb3ZlUGxhY2VkUGllY2UnLFxuICAgICAgICBwaWVjZTogcGllY2UsXG4gICAgICAgIHBsYWNlZEF0OiBrZXksXG4gICAgICAgIG1vdmVzTWFwQmFja3VwXG4gICAgfSk7XG4gICAgc3RhdGUuY2cuc2VsZWN0U3F1YXJlKGtleSk7XG59XG5cbmZ1bmN0aW9uIG9uQ2hhbmdlKHN0YXRlOiBUcmFpbENoZXNzU3RhdGUpIHtcbiAgICBjb25zdCBzdGFnZSA9IHN0YXRlLnN0YWdlO1xuICAgIGlmIChzdGFnZS5raW5kID09ICdNb3ZlUGxhY2VkUGllY2UnICYmICFzdGF0ZS5jZy5zdGF0ZS5waWVjZXMuaGFzKHN0YWdlLnBsYWNlZEF0KSkge1xuICAgICAgICAvLyBUaGUgbmV3bHkgcGxhY2VkIHBpZWNlIHdhcyByZW1vdmVkIGJ5IGRyYWdnaW5nIG91dHNpZGUgb2YgdGhlIGJvYXJkXG4gICAgICAgIGRlbGV0ZU5ld2x5UGxhY2VkUGllY2Uoc3RhdGUsIHN0YWdlLnBsYWNlZEF0KTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIG9uTW92ZShzdGF0ZTogVHJhaWxDaGVzc1N0YXRlLCBvcmlnOiBLZXksIGRlc3Q6IEtleSk6IHZvaWQge1xuICAgIGNvbnN0IHN0YWdlID0gc3RhdGUuc3RhZ2U7XG4gICAgaWYgKHN0YWdlLmtpbmQgPT0gJ01vdmVPclBsYWNlJyB8fCBzdGFnZS5raW5kID09ICdNb3ZlUGxhY2VkUGllY2UnKSB7XG4gICAgICAgIGNvbnN0IHBpZWNlID0gc3RhdGUuY2cuc3RhdGUucGllY2VzLmdldChkZXN0KSE7XG5cbiAgICAgICAgY29uc3QgcGllY2VJZCA9IHN0YXRlLnBpZWNlSWRzLmdldChvcmlnKSE7XG4gICAgICAgIGNvbnN0IGFsbG93Q3V0ID0gc3RhZ2Uua2luZCAhPSAnTW92ZVBsYWNlZFBpZWNlJztcbiAgICAgICAgY29uc3QgY2FwdHVyZWRQaWVjZUlkID0gc3RhdGUucGllY2VJZHMuZ2V0KGRlc3QpO1xuICAgICAgICBpZiAoY2FwdHVyZWRQaWVjZUlkICE9IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgLy8gQXQgdGhpcyBwb2ludCBjZy5zdGF0ZS5waWVjZXMgYWxyZWFkeSBoYXMgdGhlIG1vdmVkIHBpZWNlIHRoYXQgY2FwdHVyZWQsIHNvIGRvbid0IGRlbGV0ZSBvbiB0aGUgY2cgYm9hcmQuXG4gICAgICAgICAgICBkZWxldGVQaWVjZShzdGF0ZSwgY2FwdHVyZWRQaWVjZUlkLCBmYWxzZSk7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgdHJhaWxzID0gZ2V0VHJhaWxzRm9yTW92ZShwaWVjZS5yb2xlLCBvcmlnLCBkZXN0KVxuICAgICAgICAgICAgLmZpbHRlcih0ID0+IGFuYWx5emVGdXR1cmVUcmFpbChzdGF0ZSwgcGllY2UsIHQsIGFsbG93Q3V0LCB0cnVlKSk7XG4gICAgICAgIGlmICh0cmFpbHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgLy8gRGlzYWJsZSBtb3ZlcyB1bnRpbCB0aGUgdHJhaWwgaXMgY2hvc2VuLlxuICAgICAgICAgICAgc3RhdGUuY2cuc2V0KHttb3ZhYmxlOiB7ZGVzdHM6IG5ldyBNYXAoKX19KTtcbiAgICAgICAgICAgIGNvbnN0IG9sZFRyYWlsID0gc3RhdGUudHJhaWxzLmdldChwaWVjZUlkKTtcbiAgICAgICAgICAgIGRlbGV0ZVBpZWNlKHN0YXRlLCBwaWVjZUlkLCBmYWxzZSk7XG4gICAgICAgICAgICBzdGF0ZS5jZy5zdGF0ZS5waWVjZXMuZGVsZXRlKGRlc3QpO1xuICAgICAgICAgICAgc2V0U3RhZ2Uoc3RhdGUsIHtraW5kOiAnQ2hvb3NlVHJhaWwnLCB0cmFpbHMsIHBpZWNlLCBwaWVjZUlkLCBvbGRUcmFpbH0pO1xuICAgICAgICB9IGVsc2UgaWYgKHRyYWlscy5sZW5ndGggPT0gMSkge1xuICAgICAgICAgICAgZ3Jvd1RyYWlsKHN0YXRlLCBwaWVjZUlkLCB0cmFpbHNbMF0sIGNhcHR1cmVkUGllY2VJZCAhPSB1bmRlZmluZWQpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ0EgdmFsaWQgbW92ZSBoYXMgemVybyB0cmFpbHMgJyArIHN0YWdlLmtpbmQpO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgRXJyb3IoJ01vdmVkIGR1cmluZyBhIHdyb25nIHN0YWdlICcgKyBzdGFnZS5raW5kKTtcbiAgICB9XG4gICAgZHJhd1N0YXRlKHN0YXRlKTtcbn1cblxuZnVuY3Rpb24gc2V0U3RhZ2Uoc3RhdGU6IFRyYWlsQ2hlc3NTdGF0ZSwgc3RhZ2U6IFRyYWlsQ2hlc3NTdGFnZSkge1xuICAgIHN0YXRlLnN0YWdlID0gc3RhZ2U7XG4gICAgY29uc3QgY29udGFpbmVyID0gc3RhdGUuY2cuc3RhdGUuZG9tLmVsZW1lbnRzLmNvbnRhaW5lcjtcbiAgICBjb25zb2xlLmxvZyhKU09OLnN0cmluZ2lmeShzdGFnZSkpO1xuICAgIGNvbnRhaW5lci5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgndHJhaWxjaGVzc1N0YWdlJywge2J1YmJsZXM6IHRydWV9KSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZWxldGVQaWVjZShzdGF0ZTogVHJhaWxDaGVzc1N0YXRlLCBwaWVjZUlkOiBQaWVjZUlkLCBkZWxldGVDZykge1xuICAgIGNvbnN0IHRyYWlsID0gc3RhdGUudHJhaWxzLmdldChwaWVjZUlkKSBhcyBUcmFpbDtcbiAgICBjb25zdCBrZXkgPSBsYXN0KHRyYWlsKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiB0cmFpbCkge1xuICAgICAgICBzdGF0ZS50cmFpbE1hcC5kZWxldGUoa2V5KTtcbiAgICB9XG4gICAgc3RhdGUucGllY2VJZHMuZGVsZXRlKGtleSk7XG4gICAgc3RhdGUudHJhaWxzLmRlbGV0ZShwaWVjZUlkKTtcbiAgICBpZiAoZGVsZXRlQ2cpIHtcbiAgICAgICAgc3RhdGUuY2cuc3RhdGUucGllY2VzLmRlbGV0ZShrZXkpO1xuICAgIH1cbn1cblxuLy8gSXMgY2FsbGVkIGZyb20gb25tb3ZlIGFuZCBvbiBjaG9vc2luZyB0cmFpbC4gVGhlIHBpZWNlIGF0IG9yaWcgbWF5IG5vdCBleGlzdCBvbiB0aGUgYm9hcmQuXG5mdW5jdGlvbiBncm93VHJhaWwoc3RhdGU6IFRyYWlsQ2hlc3NTdGF0ZSwgcGllY2VJZDogUGllY2VJZCwgdHJhaWw6IEtleVtdLCBjYXB0dXJlZDogYm9vbGVhbikge1xuICAgIGNvbnN0IGRlc3QgPSBsYXN0KHRyYWlsKTtcbiAgICBjb25zdCBwaWVjZSA9IHN0YXRlLmNnLnN0YXRlLnBpZWNlcy5nZXQoZGVzdCkgYXMgUGllY2U7XG5cblxuICAgIGNvbnN0IGNoZWNrUHJvbW90aW9uID0gKCkgPT4ge1xuICAgICAgICBpZiAocGllY2Uucm9sZSA9PSAncGF3bicmJiBpc1Bhd25Qcm9tb3RlZChzdGF0ZS50cmFpbHMuZ2V0KHBpZWNlSWQpIVswXSwgZGVzdCkpIHtcbiAgICAgICAgICAgIHN0YXRlLmNnLnN0YXRlLnBpZWNlcy5zZXQoZGVzdCwge3JvbGU6ICdxdWVlbicsIGNvbG9yOiBwaWVjZS5jb2xvciwgcHJvbW90ZWQ6IHRydWV9KTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgY29uc3QgZW5kTW92ZSA9ICgpID0+IHtcbiAgICAgICAgY2hlY2tQcm9tb3Rpb24oKTtcbiAgICAgICAgcGxheU90aGVyU2lkZShzdGF0ZSk7XG4gICAgICAgIHNldFN0YWdlKHN0YXRlLCB7a2luZDogJ01vdmVPclBsYWNlJ30pO1xuICAgIH07XG5cbiAgICBzdGF0ZS5waWVjZUlkcy5kZWxldGUodHJhaWxbMF0pO1xuICAgIGNvbnN0IGN1dFNxdWFyZSA9IHRyYWlsLnNsaWNlKDEpLmZpbmQoa2V5ID0+IHN0YXRlLnRyYWlsTWFwLmhhcyhrZXkpKTtcbiAgICBjb25zb2xlLmxvZygnZ3Jvd1RyYWlsIGN1dFNxdWFyZScsIGN1dFNxdWFyZSk7XG5cbiAgICBpZiAoIWN1dFNxdWFyZSkge1xuICAgICAgICBzZXRQaWVjZVRyYWlsKHN0YXRlLCBwaWVjZUlkLCB0cmFpbCk7XG4gICAgICAgIHN0YXRlLnBpZWNlSWRzLnNldChkZXN0LCBwaWVjZUlkKTtcbiAgICAgICAgZW5kTW92ZSgpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY3V0UGllY2VJZCA9IHN0YXRlLnRyYWlsTWFwLmdldChjdXRTcXVhcmUpIGFzIFBpZWNlSWQ7XG4gICAgY29uc3QgY3V0VHJhaWwgPSBzdGF0ZS50cmFpbHMuZ2V0KGN1dFBpZWNlSWQpIGFzIFRyYWlsO1xuICAgIGNvbnN0IGN1dFBpZWNlID0gc3RhdGUuY2cuc3RhdGUucGllY2VzLmdldChcbiAgICAgICAgY3V0UGllY2VJZCA9PSBwaWVjZUlkID8gZGVzdCA6IGxhc3QoY3V0VHJhaWwpXG4gICAgKSBhcyBQaWVjZTtcblxuICAgIGxldCBjYW5kaWRhdGVUcmFpbHM6IFRyYWlsW107XG4gICAgZGVsZXRlUGllY2Uoc3RhdGUsIGN1dFBpZWNlSWQsIHRydWUpO1xuXG4gICAgaWYgKGN1dFBpZWNlSWQgPT0gcGllY2VJZCkge1xuICAgICAgICAvLyBBIHBpZWNlIGNhbiBmb2xsb3cgaW4gaXRzIG93biB0cmFpbCBvciBpbnRlcnNlY3QgaXQgbWFueSB0aW1lcy5cbiAgICAgICAgLy8gU28sIHdlIGNhbiBoYXZlIG1vcmUgdGhhbiBvbmUgdHJhaWwuXG4gICAgICAgIGNhbmRpZGF0ZVRyYWlscyA9IHNwbGl0U2VsZlRyYWlsKGN1dFRyYWlsLCB0cmFpbClcbiAgICAgICAgICAgIC5maWx0ZXIodCA9PiBpc1ZhbGlkU3ViVHJhaWwodCkpO1xuICAgICAgICBpZiAoY2FwdHVyZWQpIHtcbiAgICAgICAgICAgIC8vIElmIGEgcGllY2UgY3V0IGl0cyBvd24gcGF0aCBhbmQgY2FwdHVyZWQsXG4gICAgICAgICAgICAvLyBpdCBtdXN0IHN0YXkgb24gdGhlIHNxdWFyZSB3aGVyZSB0aGUgY2FwdHVyZSBoYXBwZW5lZC5cbiAgICAgICAgICAgIGNhbmRpZGF0ZVRyYWlscyA9IFtsYXN0KGNhbmRpZGF0ZVRyYWlscyldO1xuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gSWYgdGhlIHBpZWNlIGRvZXMgbm90IGludGVyc2VjdCBpdHMgb3duIHBhdGgsIGl0IGVuZHMgdXAgYXQgaXRzIGRlc3RpbmF0aW9uXG4gICAgICAgIHN0YXRlLnBpZWNlSWRzLnNldChkZXN0LCBwaWVjZUlkKTtcbiAgICAgICAgY29uc3QgYmVmb3JlID0gY3V0VHJhaWwuc2xpY2UoMCwgY3V0VHJhaWwuaW5kZXhPZihjdXRTcXVhcmUpKTtcbiAgICAgICAgY29uc3QgYWZ0ZXIgPSBjdXRUcmFpbC5zbGljZShjdXRUcmFpbC5pbmRleE9mKGN1dFNxdWFyZSkgKyAxKTtcbiAgICAgICAgY2FuZGlkYXRlVHJhaWxzID0gW2JlZm9yZSwgYWZ0ZXJdLmZpbHRlcih0ID0+IGlzVmFsaWRTdWJUcmFpbCh0KSk7XG4gICAgfVxuXG4gICAgaWYgKGN1dFBpZWNlSWQgIT0gcGllY2VJZCkge1xuICAgICAgICBzZXRQaWVjZVRyYWlsKHN0YXRlLCBwaWVjZUlkLCB0cmFpbCk7XG4gICAgfVxuICAgIGlmIChjYW5kaWRhdGVUcmFpbHMubGVuZ3RoID09IDApIHtcbiAgICAgICAgZW5kTW92ZSgpO1xuICAgIH0gZWxzZSBpZiAoY2FuZGlkYXRlVHJhaWxzLmxlbmd0aCA9PSAxKSB7XG4gICAgICAgIGNvbnN0IHRyYWlsID0gY2FuZGlkYXRlVHJhaWxzWzBdO1xuICAgICAgICBjb25zdCBkZXN0ID0gbGFzdCh0cmFpbCk7XG4gICAgICAgIHBsYWNlUGllY2VDRyhzdGF0ZSwgY3V0UGllY2UsIGRlc3QpO1xuICAgICAgICBzdGF0ZS5waWVjZUlkcy5zZXQoZGVzdCwgY3V0UGllY2VJZCk7XG4gICAgICAgIHNldFBpZWNlVHJhaWwoc3RhdGUsIGN1dFBpZWNlSWQsIHRyYWlsKTtcbiAgICAgICAgZW5kTW92ZSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHN0YXRlLmNnLnNldCh7bW92YWJsZToge2Rlc3RzOiBuZXcgTWFwKCl9fSk7XG4gICAgICAgIGlmIChwaWVjZUlkID09IGN1dFBpZWNlSWQpIHtcbiAgICAgICAgICAgIHN0YXRlLmNnLnN0YXRlLnBpZWNlcy5kZWxldGUoZGVzdCk7XG4gICAgICAgIH1cbiAgICAgICAgY2hlY2tQcm9tb3Rpb24oKTtcbiAgICAgICAgc2V0U3RhZ2Uoc3RhdGUsIHtcbiAgICAgICAgICAgIGtpbmQ6ICdDaG9vc2VUcmFpbCcsXG4gICAgICAgICAgICB0cmFpbHM6IGNhbmRpZGF0ZVRyYWlscyxcbiAgICAgICAgICAgIHBpZWNlOiBjdXRQaWVjZSxcbiAgICAgICAgICAgIHBpZWNlSWQ6IGN1dFBpZWNlSWRcbiAgICAgICAgfSlcbiAgICB9XG4gICAgdmFsaWRhdGVTdGF0ZShzdGF0ZSk7XG59XG5cbmZ1bmN0aW9uIHNwbGl0U2VsZlRyYWlsKG9sZFRyYWlsOiBUcmFpbCwgbmV3VHJhaWw6IFRyYWlsKTogVHJhaWxbXSB7XG4gICAgY29uc3QgbmV3VHJhaWxTZXQgPSBuZXcgU2V0KG5ld1RyYWlsKTtcbiAgICBjb25zdCB0cmFpbHM6IFRyYWlsW10gPSBbXTtcbiAgICBsZXQgY3VycmVudDogVHJhaWwgPSBbXTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBvbGRUcmFpbCkge1xuICAgICAgICBpZiAobmV3VHJhaWxTZXQuaGFzKGtleSkpIHtcbiAgICAgICAgICAgIGlmIChrZXkgPT0gbmV3VHJhaWxbMF0pIHtcbiAgICAgICAgICAgICAgICAvLyBUaGUgbGFzdCBzcXVhcmUgb2YgdGhlIG9sZCB0cmFpbCwgdGhlIGZpcnN0IHNxdWFyZSBvZiB0aGUgbmV3IG9uZS5cbiAgICAgICAgICAgICAgICBjdXJyZW50LnB1c2goLi4ubmV3VHJhaWwpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGN1cnJlbnQubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdHJhaWxzLnB1c2goY3VycmVudCk7XG4gICAgICAgICAgICAgICAgY3VycmVudCA9IFtdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY3VycmVudC5wdXNoKGtleSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKGN1cnJlbnQubGVuZ3RoKSB7XG4gICAgICAgIHRyYWlscy5wdXNoKGN1cnJlbnQpO1xuICAgIH1cbiAgICByZXR1cm4gdHJhaWxzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdmFsaWRhdGVTdGF0ZShzdGF0ZTogVHJhaWxDaGVzc1N0YXRlKSB7XG4gICAgbGV0IGFzc2VydCA9IChtc2csIGlzR29vZCkgPT4ge1xuICAgICAgICBpZiAoIWlzR29vZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1zZylcbiAgICAgICAgfVxuICAgIH07XG4gICAgbGV0IHNldEVxID0gKHMxLCBzMikgPT4gczEuc2l6ZSA9PT0gczIuc2l6ZSAmJiBbLi4uczFdLmV2ZXJ5KHggPT4gczIuaGFzKHgpKTtcbiAgICBjb25zdCBwaWVjZUlkU2V0ID0gbmV3IFNldChzdGF0ZS5waWVjZUlkcy52YWx1ZXMoKSk7XG4gICAgLy8gY2hlc3MgZmVuIGlzIGxvbmdlciAtIGl0IGluY2x1ZGVzIHR1cm5cbiAgICBhc3NlcnQoJ0VhY2gga2V5IGhhcyBhIHVuaXF1ZSBwaWVjZUlkJywgcGllY2VJZFNldC5zaXplID09IHN0YXRlLnBpZWNlSWRzLnNpemUpO1xuICAgIGFzc2VydCgnUGllY2VJZHMgYW5kIHRyYWlscyBjb3JyZXNwb25kJywgc2V0RXEocGllY2VJZFNldCwgbmV3IFNldChzdGF0ZS50cmFpbHMua2V5cygpKSkpO1xuICAgIGFzc2VydCgnUGllY2VJZHMgYW5kIGNoZXNzZ3JvdW5kIGNvcnJlc3BvbmQnLCBzZXRFcShuZXcgU2V0KHN0YXRlLnBpZWNlSWRzLmtleXMoKSksIG5ldyBTZXQoc3RhdGUuY2cuc3RhdGUucGllY2VzLmtleXMoKSkpKTtcbiAgICBbLi4uc3RhdGUucGllY2VJZHMuZW50cmllcygpXS5ldmVyeSgoW2tleSwgcGllY2VJZF0pID0+IHtcbiAgICAgICAgY29uc3QgdHJhaWwgPSBzdGF0ZS50cmFpbHMuZ2V0KHBpZWNlSWQpIGFzIFRyYWlsO1xuICAgICAgICBhc3NlcnQoYFBpZWNlSWQgJHtwaWVjZUlkfSBpcyBhdCB0aGUga2V5IGF0IHRoZSBlbmQgaXRzIHRyYWlsYCwgbGFzdCh0cmFpbCkgPT0ga2V5KTtcbiAgICB9KTtcbiAgICBhc3NlcnQoJ3RyYWlsTWFwIGhhcyBjb3JyZWN0IHBpZWNlSWRzJywgc2V0RXEocGllY2VJZFNldCwgbmV3IFNldChzdGF0ZS50cmFpbE1hcC52YWx1ZXMoKSkpKTtcbiAgICAvLyBUb2dldGhlciB0aGVzZSBjaGVja3MgYWxzbyBlbnN1cmUgdGhhdCB0cmFpbE1hcCBoYXMgbm8gZW50cmllcyB0aGF0IGFyZSBub3QgaW4gdHJhaWxzXG4gICAgc3RhdGUudHJhaWxzLmZvckVhY2goKHRyYWlsLCBwaWVjZUlkKSA9PiB7XG4gICAgICAgIGFzc2VydChgVHJhaWwgZm9yIHBpZWNlSWQgJHtwaWVjZUlkfSBoYXMgdW5pcXVlIGtleXNgLCB0cmFpbC5sZW5ndGggPT0gKG5ldyBTZXQodHJhaWwpKS5zaXplKTtcbiAgICAgICAgLy8gVGhpcyBjaGVjayBhbHNvIGVuc3VyZXMgdGhhdCB0cmFpbHMgZG8gbm90IG92ZXJsYXBcbiAgICAgICAgYXNzZXJ0KGBUcmFpbCBmb3IgcGllY2VJZCAke3BpZWNlSWR9IGlzIGluIHRyYWlsTWFwYCwgdHJhaWwuZXZlcnkoa2V5ID0+IHN0YXRlLnRyYWlsTWFwLmdldChrZXkpID09IHBpZWNlSWQpKTtcbiAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0cmFpbC5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IFt4MSwgeTFdID0ga2V5MnBvcyh0cmFpbFtpXSk7XG4gICAgICAgICAgICBjb25zdCBbeDIsIHkyXSA9IGtleTJwb3ModHJhaWxbaSArIDFdKTtcbiAgICAgICAgICAgIGFzc2VydChgVHJhaWwgZm9yIHBpZWNlSWQgJHtwaWVjZUlkfSBtdXN0IGNvbnNpc3Qgb2YgYWRqYWNlbnQgc3F1YXJlc2AsXG4gICAgICAgICAgICAgICAgTWF0aC5hYnMoeDEgLSB4MikgPD0gMSAmJiBNYXRoLmFicyh5MSAtIHkyKSA8PSAxKTtcbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgYXNzZXJ0KGBUcmFpbE1hcCBoYXMgdHJhY2tzIHRoZSBzYW1lIG51bWJlciBvZiBrZXlzIGFzIHRyYWlsc2AsXG4gICAgICAgIHN0YXRlLnRyYWlsTWFwLnNpemUgPT0gWy4uLnN0YXRlLnRyYWlscy52YWx1ZXMoKV0ucmVkdWNlKChhY2MsIHQpID0+IGFjYyArIHQubGVuZ3RoLCAwKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXRQaWVjZVRyYWlsKHN0YXRlLCBwaWVjZUlkLCB0cmFpbDogVHJhaWwpIHtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiB0cmFpbCkge1xuICAgICAgICBzdGF0ZS50cmFpbE1hcC5zZXQoa2V5LCBwaWVjZUlkKVxuICAgIH1cblxuICAgIGxldCBwaWVjZVRyYWlsID0gc3RhdGUudHJhaWxzLmdldChwaWVjZUlkKTtcbiAgICBpZiAoIXBpZWNlVHJhaWwpIHtcbiAgICAgICAgc3RhdGUudHJhaWxzLnNldChwaWVjZUlkLCB0cmFpbCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgbmV3U3F1YXJlcyA9IHRyYWlsLnNsaWNlKDEpO1xuICAgICAgICBzdGF0ZS50cmFpbHMuc2V0KHBpZWNlSWQsIHBpZWNlVHJhaWwuY29uY2F0KG5ld1NxdWFyZXMpKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGdldFRyYWlsc0Zvck1vdmUocm9sZTogUm9sZSwgb3JpZywgZGVzdCk6IFRyYWlsW10ge1xuICAgIGZ1bmN0aW9uIGxpbmVUb1RyYWlsKFt4MSwgeTFdOiBbbnVtYmVyLCBudW1iZXJdLCBbeDIsIHkyXTogW251bWJlciwgbnVtYmVyXSk6IEtleVtdIHtcbiAgICAgICAgLy8gTWFrZXMgYSBzZXF1ZW5jZSBvZiBhZGphY2VudCBrZXlzXG4gICAgICAgIC8vIFRoZSBrbmlnaHQgcGF0aCBpcyBzcGxpdCBpbiB0d28gc3RyYWlnaHQgc2VnbWVudHMsIHNvXG4gICAgICAgIC8vIGEgdHJhaWwgY2FuIG9ubHkgaGF2ZSBzdHJhaWdodCBvciBkaWFnb25hbCBzZWdtZW50cy5cbiAgICAgICAgY29uc3QgcGF0aDogS2V5W10gPSBbcG9zMmtleShbeDEsIHkxXSldO1xuICAgICAgICBjb25zdCB4RGVsdGEgPSBNYXRoLnNpZ24oeDIgLSB4MSk7IC8vICsxLCAtMSwgMFxuICAgICAgICBjb25zdCB5RGVsdGEgPSBNYXRoLnNpZ24oeTIgLSB5MSk7IC8vICsxLCAtMSwgMFxuICAgICAgICAvLyBUaGlzIGxvb3Agd2lsbCBoYW5nIGlmIHRoZSBzZWdtZW50cyBhcmVuJ3Qgc3RyYWlnaHQgb3IgZGlhZ29uYWwuXG4gICAgICAgIGxldCB4ID0geDEsIHkgPSB5MTtcbiAgICAgICAgZG8ge1xuICAgICAgICAgICAgeCArPSB4RGVsdGE7XG4gICAgICAgICAgICB5ICs9IHlEZWx0YTtcbiAgICAgICAgICAgIHBhdGgucHVzaChwb3Mya2V5KFt4LCB5XSkpO1xuICAgICAgICB9IHdoaWxlICh4ICE9IHgyIHx8IHkgIT0geTIpXG4gICAgICAgIHJldHVybiBwYXRoO1xuICAgIH1cblxuICAgIC8vIEtuaWdodCBjYW4gaGF2ZSB0d28gdHJhaWxzIGZvciB0aGUgc2FtZSBtb3ZlLlxuICAgIGNvbnN0IFt4MSwgeTFdID0ga2V5MnBvcyhvcmlnKSxcbiAgICAgICAgW3gyLCB5Ml0gPSBrZXkycG9zKGRlc3QpO1xuICAgIGlmIChyb2xlID09ICdrbmlnaHQnKSB7XG4gICAgICAgIHJldHVybiBbXG4gICAgICAgICAgICBsaW5lVG9UcmFpbChbeDEsIHkxXSwgW3gxLCB5Ml0pLmNvbmNhdChsaW5lVG9UcmFpbChbeDEsIHkyXSwgW3gyLCB5Ml0pLnNsaWNlKDEpKSxcbiAgICAgICAgICAgIGxpbmVUb1RyYWlsKFt4MSwgeTFdLCBbeDIsIHkxXSkuY29uY2F0KGxpbmVUb1RyYWlsKFt4MiwgeTFdLCBbeDIsIHkyXSkuc2xpY2UoMSkpXG4gICAgICAgIF07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIFtsaW5lVG9UcmFpbChbeDEsIHkxXSwgW3gyLCB5Ml0pXTtcbiAgICB9XG59XG5cbmNvbnN0IG1ha2VTdGFydGluZ1BpZWNlcyA9ICgpID0+IG5ldyBNYXA8Um9sZSwgbnVtYmVyPihbXG4gICAgWydxdWVlbicsIDFdLFxuICAgIFsncm9vaycsIDJdLFxuICAgIFsnYmlzaG9wJywgMl0sXG4gICAgWydrbmlnaHQnLCAyXSxcbiAgICBbJ3Bhd24nLCA4XVxuXSk7XG5cbmV4cG9ydCB0eXBlIFRyYWlsQ2hlc3NTdGF0ZSA9IHtcbiAgICBjZzogQXBpXG4gICAgcGllY2VCYW5rOiBNYXA8Q29sb3IsIE1hcDxSb2xlLCBudW1iZXI+PlxuICAgIC8vIFRoaXMgdHJhY2tzIHRyYWlscyBvZiB0aGUgcGllY2VzIG9uIGJvYXJkLiBJdCBpcyBpbiBzeW5jIHdpdGggdGhlIHN0YXRlLnBpZWNlc1xuICAgIHBpZWNlSWRzOiBNYXA8S2V5LCBQaWVjZUlkPlxuICAgIC8vIHRyYWlscyBhbmQgdHJhaWxNYXAgZGVzY3JpYmUgdGhlIHNhbWUgc3RydWN0dXJlLiBUaGlzIGlzIGFuIG9wdGltaXphdGlvbiBmb3IgYWNjZXNzIGJ5IHBpZWNlSWQgYW5kIGtleS4gVGhleSBtdXN0IGJlIGluIHN5bmMuXG4gICAgdHJhaWxzOiBNYXA8UGllY2VJZCwgVHJhaWw+XG4gICAgdHJhaWxNYXA6IE1hcDxLZXksIFBpZWNlSWQ+XG4gICAgcGllY2VJZENvdW50ZXI6IG51bWJlclxuICAgIHN0YWdlOiBUcmFpbENoZXNzU3RhZ2VcbiAgICBjb2xvcjogQ29sb3JcbiAgICAvLyBIb2xkcyB0aGUgbGFzdCBtb3ZlIGFuZCBkZXN0aW5hdGlvbnMgc28gdGhhdCB0aGV5IGNhbiBiZSByZXN0b3JlZCBhZnRlciB0YWtpbmcgYmFjayBhIGRyb3BwZWQgcGllY2VcbiAgICBtb3Zlc01hcD86IE1hcDxLZXksIE1vdmVbXT5cbiAgICBsYXN0TW92ZT86IEtleVtdXG59XG5cbmV4cG9ydCB0eXBlIFBpZWNlSWQgPSBOdW1iZXJcblxuaW50ZXJmYWNlIFRyYWlsQ2hlc3NTdGFnZU1vdmVPclBsYWNlIHtcbiAgICBraW5kOiAnTW92ZU9yUGxhY2UnXG59XG5cbmludGVyZmFjZSBUcmFpbENoZXNzU3RhZ2VNb3ZlUGxhY2VkUGllY2Uge1xuICAgIGtpbmQ6ICdNb3ZlUGxhY2VkUGllY2UnXG4gICAgcGllY2U6IFBpZWNlXG4gICAgcGxhY2VkQXQ6IEtleVxuICAgIG1vdmVzTWFwQmFja3VwOiBNYXA8S2V5LCBNb3ZlW10+XG59XG5cbmludGVyZmFjZSBUcmFpbENoZXNzU3RhZ2VDaG9vc2VUcmFpbCB7XG4gICAga2luZDogJ0Nob29zZVRyYWlsJ1xuICAgIHRyYWlsczogVHJhaWxbXVxuICAgIG9sZFRyYWlsPzogVHJhaWxcbiAgICBwaWVjZTogUGllY2VcbiAgICBwaWVjZUlkOiBQaWVjZUlkXG59XG5cbnR5cGUgVHJhaWxDaGVzc1N0YWdlID0gVHJhaWxDaGVzc1N0YWdlTW92ZU9yUGxhY2VcbiAgICB8IFRyYWlsQ2hlc3NTdGFnZU1vdmVQbGFjZWRQaWVjZVxuICAgIHwgVHJhaWxDaGVzc1N0YWdlQ2hvb3NlVHJhaWxcblxuXG5mdW5jdGlvbiBwbGFjZVBpZWNlQ0coc3RhdGU6IFRyYWlsQ2hlc3NTdGF0ZSwgcGllY2U6IFBpZWNlLCBrZXk6IEtleSkge1xuICAgIC8vIFVwZGF0ZSB0aGUgc3RhdGUgZGlyZWN0bHkuIFRoZSBmdW5jdGlvbiBkcm9wTmV3UGllY2UgY2hhbmdlcyBjb2xvciBhbmQgbW92YWJsZXMuXG4gICAgc3RhdGUuY2cuc3RhdGUucGllY2VzLnNldChrZXksIHBpZWNlKTtcbn1cblxuZnVuY3Rpb24gb25TZWxlY3Qoc3RhdGU6IFRyYWlsQ2hlc3NTdGF0ZSwga2V5OiBLZXkpIHtcbiAgICBjb25zdCBzdGFnZSA9IHN0YXRlLnN0YWdlO1xuXG4gICAgaWYgKHN0YXRlLmNnLnN0YXRlLmxhc3RNb3ZlPy5sZW5ndGggPT0gMiAmJiBzdGF0ZS5jZy5zdGF0ZS5sYXN0TW92ZVsxXSA9PSBrZXkpIHtcbiAgICAgICAgaWYgKHN0YWdlLmtpbmQgIT0gJ0Nob29zZVRyYWlsJykge1xuICAgICAgICAgICAgLy8gSWYgb25TZWxlY3Qgd2FzIGludm9rZWQgYXMgYSByZXN1bHQgb2YgdGhlIG1vdmUsIGxldCBvbk1vdmUgaGFuZGxlIHRoZSBjaGFuZ2UuXG4gICAgICAgICAgICAvLyBXZSBjYW4gb25seSBpbmRpcmVjdGx5IGRlZHVjZSBpdCBmcm9tIHRoZSBzdGFnZS4gQWxzbywgaXQgY2FuIGJlIGEgY2xpY2sgc2VsZWN0aW5nIGEgcGllY2UuXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHN0YWdlLmtpbmQgPT0gJ01vdmVQbGFjZWRQaWVjZScpIHtcbiAgICAgICAgaWYgKHN0YXRlLmNnLnN0YXRlLnNlbGVjdGVkICE9PSBzdGFnZS5wbGFjZWRBdCkge1xuICAgICAgICAgICAgc3RhdGUuY2cuc2VsZWN0U3F1YXJlKHN0YWdlLnBsYWNlZEF0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN0YXRlLmNnLnN0YXRlLmRyYWdnYWJsZS5kZWxldGVPbkRyb3BPZmYgPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICB9IGVsc2UgaWYgKHN0YWdlLmtpbmQgPT0gJ0Nob29zZVRyYWlsJykge1xuICAgICAgICBjb25zdCB0cmFpbHNXaXRoS2V5ID0gc3RhZ2UudHJhaWxzXG4gICAgICAgICAgICAubWFwKHQgPT4gdC5pbmNsdWRlcyhrZXkpKTtcbiAgICAgICAgY29uc3QgdHJhaWxJbmRleCA9IHRyYWlsc1dpdGhLZXkuaW5kZXhPZih0cnVlKTtcbiAgICAgICAgaWYgKHRyYWlsSW5kZXggPT0gLTEgfHwgdHJhaWxzV2l0aEtleS5pbmRleE9mKHRydWUsIHRyYWlsSW5kZXggKyAxKSAhPSAtMSkge1xuICAgICAgICAgICAgLy8gTm90IGZvdW5kIG9yIG5vdCB1bmlxdWVcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCB0cmFpbCA9IHN0YWdlLnRyYWlsc1t0cmFpbEluZGV4XTtcbiAgICAgICAgY29uc3Qgc3RhcnRUcmFpbCA9IHN0YWdlLm9sZFRyYWlsID8gc3RhZ2Uub2xkVHJhaWwgOiBbdHJhaWxbMF1dO1xuXG4gICAgICAgIGNvbnNvbGUubG9nKCdTdGFydCB0cmFpbCcsIHN0YXJ0VHJhaWwsICd0cmFpbCcsIHRyYWlsKTtcbiAgICAgICAgcGxhY2VQaWVjZUNHKHN0YXRlLCBzdGFnZS5waWVjZSwgbGFzdCh0cmFpbCkpO1xuICAgICAgICBzdGF0ZS5waWVjZUlkcy5zZXQodHJhaWxbMF0sIHN0YWdlLnBpZWNlSWQpO1xuICAgICAgICBzZXRQaWVjZVRyYWlsKHN0YXRlLCBzdGFnZS5waWVjZUlkLCBzdGFydFRyYWlsKTtcbiAgICAgICAgZ3Jvd1RyYWlsKHN0YXRlLCBzdGFnZS5waWVjZUlkLCB0cmFpbCwgZmFsc2UpO1xuICAgIH1cbiAgICBkcmF3U3RhdGUoc3RhdGUpO1xufVxuXG5mdW5jdGlvbiBsb2dTdGF0ZShzdGF0ZTogVHJhaWxDaGVzc1N0YXRlKSB7XG4gICAgY29uc29sZS5sb2coc3RhdGUuY2cuc3RhdGUudHVybkNvbG9yKTtcbiAgICBjb25zb2xlLmxvZyhzdGF0ZS5zdGFnZS5raW5kKTtcbiAgICBjb25zb2xlLmxvZygncGllY2VJZHMnLCBKU09OLnN0cmluZ2lmeShbLi4uc3RhdGUucGllY2VJZHNdKSk7XG4gICAgY29uc29sZS5sb2coJ3RyYWlsTWFwJywgSlNPTi5zdHJpbmdpZnkoWy4uLnN0YXRlLnRyYWlsTWFwXSkpO1xuICAgIGNvbnNvbGUubG9nKCd0cmFpbHMnLCBKU09OLnN0cmluZ2lmeShbLi4uc3RhdGUudHJhaWxzXSkpO1xufVxuXG5mdW5jdGlvbiBkcmF3U3RhdGUoc3RhdGU6IFRyYWlsQ2hlc3NTdGF0ZSkge1xuICAgIGNvbnN0IHN0YWdlID0gc3RhdGUuc3RhZ2U7XG4gICAgbG9nU3RhdGUoc3RhdGUpO1xuICAgIGNvbnN0IGNvbnRhaW5lciA9IHN0YXRlLmNnLnN0YXRlLmRvbS5lbGVtZW50cy5jb250YWluZXI7XG4gICAgbGV0IHRyYWlsc1N2ZyA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcuY2ctdHJhaWxzJyk7XG4gICAgaWYgKCF0cmFpbHNTdmcpIHtcbiAgICAgICAgdHJhaWxzU3ZnID0gc2V0QXR0cmlidXRlcyhjcmVhdGVTVkcoJ3N2ZycpLCB7J2NsYXNzJzogJ2NnLXRyYWlscyd9KTtcbiAgICAgICAgdHJhaWxzU3ZnLmFwcGVuZENoaWxkKGNyZWF0ZVNWRygnZycpKTtcbiAgICAgICAgY29udGFpbmVyLmFwcGVuZENoaWxkKHRyYWlsc1N2Zyk7XG4gICAgfVxuXG4gICAgY29uc3QgdHJhaWxzVG9EcmF3OiB7IHRyYWlsOiBUcmFpbCwgY2xhc3Nlczogc3RyaW5nW10gfVtdID0gW107XG4gICAgZm9yIChjb25zdCB0cmFpbCBvZiBzdGF0ZS50cmFpbHMudmFsdWVzKCkpIHtcbiAgICAgICAgY29uc3QgcG9zaXRpb24gPSBsYXN0KHRyYWlsKTtcbiAgICAgICAgY29uc3Qge2NvbG9yfSA9IHN0YXRlLmNnLnN0YXRlLnBpZWNlcy5nZXQocG9zaXRpb24pITtcbiAgICAgICAgdHJhaWxzVG9EcmF3LnB1c2goe2NsYXNzZXM6IFtgdHJhaWwtJHtjb2xvcn1gXSwgdHJhaWx9KTtcbiAgICB9XG4gICAgaWYgKHN0YWdlLmtpbmQgPT0gJ0Nob29zZVRyYWlsJykge1xuICAgICAgICBzdGFnZS50cmFpbHMuZm9yRWFjaCh0cmFpbCA9PlxuICAgICAgICAgICAgdHJhaWxzVG9EcmF3LnB1c2goe2NsYXNzZXM6IFtgdHJhaWwtY2hvb3NlYCwgYHRyYWlsLSR7c3RhZ2UucGllY2UuY29sb3J9YF0sIHRyYWlsfSlcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHN0YWdlLm9sZFRyYWlsKSB7XG4gICAgICAgICAgICB0cmFpbHNUb0RyYXcucHVzaCh7Y2xhc3NlczogW2B0cmFpbC0ke3N0YWdlLnBpZWNlLmNvbG9yfWBdLCB0cmFpbDogc3RhZ2Uub2xkVHJhaWx9KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBjb25zdCBzaGFwZXM6IERyYXdTaGFwZVtdID0gW107XG4gICAgaWYgKHN0YWdlLmtpbmQgPT0gJ0Nob29zZVRyYWlsJykge1xuICAgICAgICBzdGFnZS50cmFpbHMuZm9yRWFjaCh0cmFpbCA9PlxuICAgICAgICAgICAgc2hhcGVzLnB1c2goe1xuICAgICAgICAgICAgICAgIG9yaWc6IGxhc3QodHJhaWwpLFxuICAgICAgICAgICAgICAgIHBpZWNlOiBzdGFnZS5waWVjZVxuICAgICAgICAgICAgfSkpO1xuICAgIH1cbiAgICBzeW5jVHJhaWxzU3ZnKHN0YXRlLmNnLCB0cmFpbHNTdmcucXVlcnlTZWxlY3RvcignZycpISwgdHJhaWxzVG9EcmF3KTtcbiAgICBzdGF0ZS5jZy5zZXRBdXRvU2hhcGVzKHNoYXBlcyk7XG4gICAgdmFsaWRhdGVTdGF0ZShzdGF0ZSk7XG59XG5cbmZ1bmN0aW9uIGRyYXdUcmFpbChjZzogQXBpLCBjbGFzc2VzOiBzdHJpbmdbXSwgdHJhaWw6IFRyYWlsKTogU1ZHRWxlbWVudCB7XG4gICAgZnVuY3Rpb24gcG9zMnB4KHBvczogY2cuUG9zLCBib3VuZHM6IENsaWVudFJlY3QpOiBjZy5OdW1iZXJQYWlyIHtcbiAgICAgICAgcmV0dXJuIFsoKHBvc1swXSArIDAuNSkgKiBib3VuZHMud2lkdGgpIC8gOCwgKCg3LjUgLSBwb3NbMV0pICogYm91bmRzLmhlaWdodCkgLyA4XTtcbiAgICB9XG5cbiAgICBjb25zdCBib3VuZHMgPSBjZy5zdGF0ZS5kb20uYm91bmRzKCk7XG4gICAgY29uc3QgbGluZVdpZHRoID0gKDEwIC8gNTEyKSAqIGJvdW5kcy53aWR0aDtcblxuICAgIGNvbnN0IHBvaW50cyA9IHRyYWlsLm1hcChzID0+IHtcbiAgICAgICAgY29uc3QgW3gsIHldID0gcG9zMnB4KGtleTJwb3MocyksIGJvdW5kcyk7XG4gICAgICAgIHJldHVybiB4ICsgJywnICsgeTtcbiAgICB9KS5qb2luKCcgJyk7XG4gICAgcmV0dXJuIHNldEF0dHJpYnV0ZXMoY3JlYXRlU1ZHKCdwb2x5bGluZScpLCB7XG4gICAgICAgIGNsYXNzOiBcInRyYWlsIFwiICsgY2xhc3Nlcy5qb2luKCcgJyksXG4gICAgICAgICdzdHJva2Utd2lkdGgnOiBsaW5lV2lkdGgsXG4gICAgICAgIHBvaW50czogcG9pbnRzXG4gICAgfSk7XG59XG5cbmZ1bmN0aW9uIHN5bmNUcmFpbHNTdmcoY2c6IEFwaSwgcm9vdDogU1ZHRWxlbWVudCwgdHJhaWxzOiB7IHRyYWlsOiBUcmFpbCwgY2xhc3Nlczogc3RyaW5nW10gfVtdKSB7XG4gICAgY29uc3QgaGFzaFRyYWlsID0gKHRyYWlsLCBjbGFzc2VzKSA9PiBjbGFzc2VzICsgSlNPTi5zdHJpbmdpZnkodHJhaWwpO1xuICAgIGNvbnN0IHRyYWlsc0luRG9tID0gbmV3IE1hcCgpLCAvLyBieSBoYXNoXG4gICAgICAgIHRvUmVtb3ZlOiBTVkdFbGVtZW50W10gPSBbXTtcbiAgICBmb3IgKGNvbnN0IHt0cmFpbCwgY2xhc3Nlc30gb2YgdHJhaWxzKSB0cmFpbHNJbkRvbS5zZXQoaGFzaFRyYWlsKHRyYWlsLCBjbGFzc2VzKSwgZmFsc2UpO1xuICAgIGxldCBlbDogU1ZHRWxlbWVudCB8IHVuZGVmaW5lZCA9IHJvb3QuZmlyc3RDaGlsZCBhcyBTVkdFbGVtZW50LFxuICAgICAgICB0cmFpbEtleXM6IHN0cmluZztcbiAgICB3aGlsZSAoZWwpIHtcbiAgICAgICAgdHJhaWxLZXlzID0gZWwuZ2V0QXR0cmlidXRlKCdjZ1RyYWlsJykgYXMgc3RyaW5nO1xuICAgICAgICAvLyBmb3VuZCBhIHNoYXBlIGVsZW1lbnQgdGhhdCdzIGhlcmUgdG8gc3RheVxuICAgICAgICBpZiAodHJhaWxzSW5Eb20uaGFzKHRyYWlsS2V5cykpIHRyYWlsc0luRG9tLnNldCh0cmFpbEtleXMsIHRydWUpO1xuICAgICAgICAvLyBvciByZW1vdmUgaXRcbiAgICAgICAgZWxzZSB0b1JlbW92ZS5wdXNoKGVsKTtcbiAgICAgICAgZWwgPSBlbC5uZXh0U2libGluZyBhcyBTVkdFbGVtZW50IHwgdW5kZWZpbmVkO1xuICAgIH1cbiAgICAvLyByZW1vdmUgb2xkIHNoYXBlc1xuICAgIGZvciAoY29uc3QgZWwgb2YgdG9SZW1vdmUpIHJvb3QucmVtb3ZlQ2hpbGQoZWwpO1xuICAgIC8vIGluc2VydCBzaGFwZXMgdGhhdCBhcmUgbm90IHlldCBpbiBkb21cbiAgICBmb3IgKGNvbnN0IHt0cmFpbCwgY2xhc3Nlc30gb2YgdHJhaWxzKSB7XG4gICAgICAgIGlmICghdHJhaWxzSW5Eb20uZ2V0KGhhc2hUcmFpbCh0cmFpbCwgY2xhc3NlcykpKSByb290LmFwcGVuZENoaWxkKGRyYXdUcmFpbChjZywgY2xhc3NlcywgdHJhaWwpKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGxhc3Q8VD4oYXJyOiBUW10pOiBUIHtcbiAgICByZXR1cm4gYXJyW2Fyci5sZW5ndGggLSAxXTtcbn1cblxuZnVuY3Rpb24gZGVsZXRlTmV3bHlQbGFjZWRQaWVjZShzdGF0ZTogVHJhaWxDaGVzc1N0YXRlLCBrZXkpIHtcbiAgICBjb25zdCBzdGFnZSA9IHN0YXRlLnN0YWdlO1xuICAgIGlmIChzdGFnZS5raW5kICE9PSAnTW92ZVBsYWNlZFBpZWNlJykge1xuICAgICAgICB0aHJvdyAnRXhwZWN0ZWQgTW92ZVBsYWNlUGllY2Ugc3RhZ2UnO1xuICAgIH1cbiAgICBjb25zdCBwaWVjZSA9IHN0YWdlLnBpZWNlO1xuICAgIGRlbGV0ZVBpZWNlKHN0YXRlLCBzdGF0ZS5waWVjZUlkcy5nZXQoa2V5KSBhcyBudW1iZXIsIHRydWUpO1xuICAgIHN0YXRlLm1vdmVzTWFwID0gc3RhZ2UubW92ZXNNYXBCYWNrdXA7XG4gICAgc3RhdGUuY2cuc2V0KHtcbiAgICAgICAgbW92YWJsZToge1xuICAgICAgICAgICAgZGVzdHM6IG1vdmVzVG9EZXN0cyhzdGF0ZS5tb3Zlc01hcClcbiAgICAgICAgfSxcbiAgICAgICAgbGFzdE1vdmU6IHN0YXRlLmxhc3RNb3ZlLFxuICAgICAgICBzZWxlY3RlZDogdW5kZWZpbmVkXG4gICAgfSlcbiAgICBjb25zdCBwbGF5ZXJQaWVjZXMgPSBzdGF0ZS5waWVjZUJhbmsuZ2V0KHBpZWNlLmNvbG9yKSBhcyBNYXA8Um9sZSwgTnVtYmVyPjtcbiAgICBjb25zdCBuZXdQaWVjZUNvdW50ID0gcGxheWVyUGllY2VzLmdldChwaWVjZS5yb2xlKSBhcyBudW1iZXIgKyAxO1xuICAgIHBsYXllclBpZWNlcy5zZXQocGllY2Uucm9sZSwgbmV3UGllY2VDb3VudCk7XG4gICAgY29uc3QgcGllY2VFbCA9IGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoYC5wb2NrZXQgLiR7cGllY2Uucm9sZX0uJHtwaWVjZS5jb2xvcn1gKSBhcyBIVE1MRWxlbWVudDtcbiAgICBwaWVjZUVsLmRhdGFzZXQuY291bnQgPSBTdHJpbmcobmV3UGllY2VDb3VudCk7XG4gICAgc2V0U3RhZ2Uoc3RhdGUsIHtraW5kOiAnTW92ZU9yUGxhY2UnfSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTW92ZSB7XG4gICAgcGllY2U6IFBpZWNlXG4gICAgcGllY2VJZDogUGllY2VJZFxuICAgIGNhcHR1cmVzPzoge3BpZWNlSWQ6IFBpZWNlSWQsIHBpZWNlOiBQaWVjZX1cbiAgICBjdXRzPzogeyBwaWVjZUlkOiBQaWVjZUlkLCBwaWVjZTogUGllY2UsIGlzRXJhc2VkOiBib29sZWFuIH1cbiAgICB0cmFpbDogVHJhaWxcbn1cblxuZnVuY3Rpb24gYW5hbHl6ZUZ1dHVyZVRyYWlsKHN0YXRlOiBUcmFpbENoZXNzU3RhdGUsIHBpZWNlOiBQaWVjZSwgdHJhaWw6IFRyYWlsLCBhbGxvd0N1dCwgaXNNb3ZlZCk6IE1vdmUgfCBudWxsIHtcbiAgICAvLyBUcmFpbCBpcyB2YWxpZCBpZjpcbiAgICAvLyBJZiBhIHBpZWNlIGlzIGNhcHR1cmVkLCBpdHMgdHJhaWwgaXMgaWdub3JlZCBpbiB0aGUgcnVsZXMgYmVsb3cuXG4gICAgLy8gQSBuZXcgdHJhaWwgY3V0cyBhbiBleGlzdGluZyB0cmFpbCB3aGVuIHRoZXkgc2hhcmUgb25lIGNvbW1vbiBzcXVhcmUuXG4gICAgLy8gVHJhaWwgY2Fubm90IGN1dCBtb3JlIHRoYW4gb25lIHRyYWlsIG9mIGEgcGllY2UsIGluY2x1ZGluZyBpdHMgb3duLlxuICAgIC8vIFRyYWlsIGNhbm5vdCBmb2xsb3cgb3ZlcmxhcCB3aXRoIHRoZSB0cmFpbCBvZiBhbm90aGVyIHBpZWNlLlxuICAgIC8vIE5ldyB0cmFpbCBvZiBhIHBpZWNlIGNhbiBvdmVybGFwIHdpdGggaXRzIG93biB0cmFpbC5cbiAgICAvLyBBIHBpZWNlIGNhbiBjdXQgaXRzIG93biB0cmFpbCBvbmx5IG9uY2UgdG9vLlxuICAgIGlmICh0cmFpbC5sZW5ndGggPD0gMSkge1xuICAgICAgICAvLyBhbnkgdHJhaWwgbG9uZ2VyIHRoYW4gdGhlIGN1cnJlbnQgc3F1YXJlIGlzIGZpbmUuIEZvciB0aGUga25pZ2h0IHRvb1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBkZXN0ID0gbGFzdCh0cmFpbCk7XG4gICAgY29uc3QgcGllY2VJZCA9IHN0YXRlLnBpZWNlSWRzLmdldCh0cmFpbFswXSkhO1xuICAgIGxldCBjdXRQaWVjZUlkOiBQaWVjZUlkIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuICAgIGxldCBjdXRTcXVhcmU6IEtleSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgICBjb25zdCBjYXB0dXJlZFBpZWNlSWQgPSBzdGF0ZS5waWVjZUlkcy5nZXQoZGVzdCk7XG4gICAgY29uc3QgY2FwdHVyZWRQaWVjZSA9IHN0YXRlLmNnLnN0YXRlLnBpZWNlcy5nZXQoZGVzdCk7XG5cbiAgICBmb3IgKGNvbnN0IHMgb2YgdHJhaWwuc2xpY2UoMSkpIHtcbiAgICAgICAgY29uc3QgcGllY2VJZE9uVHJhaWwgPSBzdGF0ZS50cmFpbE1hcC5nZXQocyk7XG4gICAgICAgIGlmIChwaWVjZUlkT25UcmFpbCA9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9IGVsc2UgaWYgKCFhbGxvd0N1dCkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgcGllY2VPblRyYWlsID0gc3RhdGUuY2cuc3RhdGUucGllY2VzLmdldChzKTtcbiAgICAgICAgaWYgKHBpZWNlT25UcmFpbCkge1xuICAgICAgICAgICAgaWYgKHMgIT0gZGVzdCkge1xuICAgICAgICAgICAgICAgIC8vIFRoZSB0cmFpbCBjYW5ub3QgaGF2ZSBhbnkgcGllY2VzIHRpbGwgdGhlIGVuZC5cbiAgICAgICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIWlzTW92ZWQgJiYgcGllY2VPblRyYWlsLmNvbG9yID09IHBpZWNlLmNvbG9yKSB7XG4gICAgICAgICAgICAgICAgLy8gQ2Fubm90IGNhcHR1cmUgcGllY2Ugb2Ygb3duIGNvbG9yIGF0IHRoZSBlbmQgb2YgdGhlIHRyYWlsLlxuICAgICAgICAgICAgICAgIC8vIElmIGlzVmFsaWRGdXR1cmVUcmFpbCBpcyBjYWxsZWQgYmVmb3JlIG1vdmUsIGRlc3QgaGFzIGEgcGllY2Ugb2Ygb3Bwb3NpdGUgY29sb3JcbiAgICAgICAgICAgICAgICAvLyB0aGF0IHdvdWxkIGJlIGNhcHR1cmVkLiBJZiBjYWxsZWQgb24gbW92ZSwgaXQgd291bGQgYmUgdGhlIHBpZWNlIHRoYXQgbW92ZWQuXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAocGllY2VJZE9uVHJhaWwgPT0gY2FwdHVyZWRQaWVjZUlkKSB7XG4gICAgICAgIH0gZWxzZSBpZiAoY3V0UGllY2VJZCA9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGN1dFBpZWNlSWQgPSBwaWVjZUlkT25UcmFpbDtcbiAgICAgICAgICAgIGN1dFNxdWFyZSA9IHM7XG4gICAgICAgIH0gZWxzZSBpZiAocGllY2VJZE9uVHJhaWwgIT0gY3V0UGllY2VJZCkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7ICAvLyBDdXR0aW5nIHRyYWlscyBvZiB0d28gcGllY2VzXG4gICAgICAgIH0gZWxzZSBpZiAocGllY2VJZE9uVHJhaWwgIT0gcGllY2VJZCkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7ICAvLyBHb2luZyB0aHJvdWdoIG1hbnkgc3F1YXJlcyBvZiBhIHRyYWlsIGluc3RlYWQgb2YgY3V0dGluZyBpdFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgbGV0IGN1dHM6IHtwaWVjZUlkOiBQaWVjZUlkLCBwaWVjZTogUGllY2UsIGlzRXJhc2VkOiBib29sZWFufSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgICBpZiAoY3V0UGllY2VJZCAhPSB1bmRlZmluZWQpIHtcbiAgICAgICAgbGV0IGlzRXJhc2VkID0gZmFsc2U7XG4gICAgICAgIGNvbnN0IGN1dFRyYWlsID0gc3RhdGUudHJhaWxzLmdldChjdXRQaWVjZUlkKSBhcyBUcmFpbDtcbiAgICAgICAgY29uc3QgcGllY2UgPSBzdGF0ZS5jZy5zdGF0ZS5waWVjZXMuZ2V0KGxhc3QoY3V0VHJhaWwpKSBhcyBQaWVjZTtcbiAgICAgICAgaWYgKGN1dFBpZWNlSWQgIT0gcGllY2VJZCkge1xuICAgICAgICAgICAgY29uc3QgYmVmb3JlID0gY3V0VHJhaWwuc2xpY2UoMCwgY3V0VHJhaWwuaW5kZXhPZihjdXRTcXVhcmUgYXMgS2V5KSk7XG4gICAgICAgICAgICBjb25zdCBhZnRlciA9IGN1dFRyYWlsLnNsaWNlKGN1dFRyYWlsLmluZGV4T2YoY3V0U3F1YXJlIGFzIEtleSkgKyAxKTtcbiAgICAgICAgICAgIGlzRXJhc2VkID0gIWlzVmFsaWRTdWJUcmFpbChiZWZvcmUpICYmICFpc1ZhbGlkU3ViVHJhaWwoYWZ0ZXIpO1xuICAgICAgICB9XG4gICAgICAgIGN1dHMgPSB7cGllY2VJZDogY3V0UGllY2VJZCwgcGllY2UsIGlzRXJhc2VkfTtcbiAgICB9XG4gICAgY29uc3QgY2FwdHVyZXMgPSBjYXB0dXJlZFBpZWNlSWQgIT09IHVuZGVmaW5lZCA/IHtwaWVjZUlkOiBjYXB0dXJlZFBpZWNlSWQsIHBpZWNlOiBjYXB0dXJlZFBpZWNlIX0gOiB1bmRlZmluZWQ7XG4gICAgcmV0dXJuIHtwaWVjZSwgcGllY2VJZCwgY2FwdHVyZXMsIGN1dHMsIHRyYWlsfTtcbn1cblxuZnVuY3Rpb24gaXNWYWxpZFN1YlRyYWlsKHRyYWlsKSB7XG4gICAgLy8gYW55IHRyYWlsIGxvbmdlciB0aGFuIHRoZSBjdXJyZW50IHNxdWFyZSBpcyBmaW5lLiBGb3IgdGhlIGtuaWdodCB0b29cbiAgICByZXR1cm4gdHJhaWwubGVuZ3RoID4gMTtcbn1cblxuZnVuY3Rpb24gaXNQYXduUHJvbW90ZWQodHJhaWxTdGFydDogS2V5LCBkZXN0OiBLZXkpIHtcbiAgICBjb25zdCBbW3gxLCB5MV0sIFt4MiwgeTJdXSA9IFt0cmFpbFN0YXJ0LCBkZXN0XS5tYXAoa2V5MnBvcyk7XG4gICAgY29uc3QgW3hEZWx0YSwgeURlbHRhXSA9IFt4MiAtIHgxLCB5MiAtIHkxXTtcbiAgICBjb25zdCBnZXRFZGdlSW5kZXggPSBkZWx0YSA9PiBkZWx0YSA9PSAwID8gbnVsbCA6IChkZWx0YSA8IDAgPyAwIDogNyk7XG4gICAgY29uc3QgW3hFZGdlLCB5RWRnZV0gPSBbZ2V0RWRnZUluZGV4KHhEZWx0YSksIGdldEVkZ2VJbmRleCh5RGVsdGEpXTtcbiAgICBpZiAoTWF0aC5hYnMoeERlbHRhKSA9PSBNYXRoLmFicyh5RGVsdGEpKSB7XG4gICAgICAgIHJldHVybiB4MiA9PSB4RWRnZSB8fCB5MiA9PSB5RWRnZTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gTWF0aC5hYnMoeERlbHRhKSA+IE1hdGguYWJzKHlEZWx0YSkgPyB4MiA9PSB4RWRnZSA6IHkyID09IHlFZGdlO1xuICAgIH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldE1vdmVzKHN0YXRlOiBUcmFpbENoZXNzU3RhdGUsIGtleTogS2V5LCBhbGxvd0NhcHR1cmU6IGJvb2xlYW4sIGFsbG93Q3V0OiBib29sZWFuKTogTW92ZVtdIHtcbiAgICBjb25zdCBzZWxmUGllY2VJZCA9IHN0YXRlLnBpZWNlSWRzLmdldChrZXkpO1xuICAgIGNvbnN0IHBpZWNlID0gc3RhdGUuY2cuc3RhdGUucGllY2VzLmdldChrZXkpO1xuICAgIGlmIChzZWxmUGllY2VJZCA9PT0gdW5kZWZpbmVkIHx8IHBpZWNlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBwaWVjZSBmb3VuZCcpO1xuICAgIH1cbiAgICBsZXQgZGVzdHM6IEtleVtdO1xuICAgIGlmIChwaWVjZS5yb2xlID09ICdwYXduJykge1xuICAgICAgICBjb25zdCB0cmFpbCA9IHN0YXRlLnRyYWlscy5nZXQoc2VsZlBpZWNlSWQpIGFzIFRyYWlsO1xuICAgICAgICBpZiAodHJhaWwubGVuZ3RoID09IDEpIHtcbiAgICAgICAgICAgIC8vIFRoZSBmaXJzdCBtb3ZlIG9ubHkgZGVwZW5kcyBvbiB0aGUgcXVhZHJhbnQuIE5vIGNhcHR1cmUuXG4gICAgICAgICAgICBjb25zdCBbeCwgeV0gPSBrZXkycG9zKGtleSk7XG4gICAgICAgICAgICBjb25zdCB4U2lnbiA9IHggPCA0ID8gMSA6IC0xOyAgLy8gTW92ZSB0b3dhcmQgZnVydGhlciBlZGdlLlxuICAgICAgICAgICAgY29uc3QgeVNpZ24gPSB5IDwgNCA/IDEgOiAtMTtcbiAgICAgICAgICAgIGRlc3RzID0gW1t4ICsgMSAqIHhTaWduLCB5XSwgW3ggKyAyICogeFNpZ24sIHldLCBbeCwgeSArIDEgKiB5U2lnbl0sXG4gICAgICAgICAgICAgICAgW3gsIHkgKyAyICogeVNpZ25dXS5tYXAocG9zMmtleSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBDb250aW51ZSBpbiB0aGUgZGlyZWN0aW9uLiBJZiB0aGUgYm91bmRpbmcgcmVjdGFuZ2xlIG9mIHRoZSB0cmFpbCBpcyBhIHNxdWFyZSxcbiAgICAgICAgICAgIC8vIHRoZSBwYXduIGNhbiBzdGlsbCBjaG9vc2UgdGhlIGRpcmVjdGlvbi4gRm9yIGV4YW1wbGUsIHBhd24gb25seSBtb3ZlZCBkaWFnb25hbGx5IHdpdGggY2FwdHVyZXMuXG4gICAgICAgICAgICBjb25zdCBbW3gxLCB5MV0sIFt4MiwgeTJdXSA9IFt0cmFpbFswXSwgbGFzdCh0cmFpbCldLm1hcChrZXkycG9zKTtcbiAgICAgICAgICAgIGNvbnN0IFt4RGVsdGEsIHlEZWx0YV0gPSBbeDIgLSB4MSwgeTIgLSB5MV07XG4gICAgICAgICAgICBjb25zdCBpc1Bvc1ZhbGlkID0gKFt4LCB5XSkgPT4geCA+PSAwICYmIHggPCA4ICYmIHkgPj0gMCAmJiB5IDwgODtcbiAgICAgICAgICAgIGxldCBwYXduTW92ZXM6IFtbbnVtYmVyLCBudW1iZXJdLCBib29sZWFuXVtdO1xuICAgICAgICAgICAgY29uc3QgeE1vdmVzOiBbW251bWJlciwgbnVtYmVyXSwgYm9vbGVhbl1bXSA9XG4gICAgICAgICAgICAgICAgW1tbeDIgKyBNYXRoLnNpZ24oeERlbHRhKSwgeTIgLSAxXSwgdHJ1ZV0sIFtbeDIgKyBNYXRoLnNpZ24oeERlbHRhKSwgeTJdLCBmYWxzZV0sIFtbeDIgKyBNYXRoLnNpZ24oeERlbHRhKSwgeTIgKyAxXSwgdHJ1ZV1dO1xuICAgICAgICAgICAgY29uc3QgeU1vdmVzOiBbW251bWJlciwgbnVtYmVyXSwgYm9vbGVhbl1bXSA9XG4gICAgICAgICAgICAgICAgW1tbeDIgLSAxLCB5MiArIE1hdGguc2lnbih5RGVsdGEpXSwgdHJ1ZV0sIFtbeDIsIHkyICsgTWF0aC5zaWduKHlEZWx0YSldLCBmYWxzZV0sIFtbeDIgKyAxLCB5MiArIE1hdGguc2lnbih5RGVsdGEpXSwgdHJ1ZV1dO1xuICAgICAgICAgICAgaWYgKE1hdGguYWJzKHhEZWx0YSkgPT0gTWF0aC5hYnMoeURlbHRhKSkge1xuICAgICAgICAgICAgICAgIHBhd25Nb3ZlcyA9IFsuLi54TW92ZXMsIC4uLnlNb3Zlc107XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHBhd25Nb3ZlcyA9IE1hdGguYWJzKHhEZWx0YSkgPiBNYXRoLmFicyh5RGVsdGEpID8geE1vdmVzIDogeU1vdmVzO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZGVzdHMgPSBwYXduTW92ZXMuZmlsdGVyKChbcG9zLCBfXSkgPT4gaXNQb3NWYWxpZChwb3MpKVxuICAgICAgICAgICAgICAgIC8vIEZpbHRlciBvdXQgdGhlIGRpYWdvbmFsIG1vdmVzIGlmIHRoZXJlIGlzIG5vIHBpZWNlIHRvIGNhcHR1cmVcbiAgICAgICAgICAgICAgICAuZmlsdGVyKChbcG9zLCBjYXB0dXJlXSkgPT4gc3RhdGUuY2cuc3RhdGUucGllY2VzLmhhcyhwb3Mya2V5KHBvcykpID8gY2FwdHVyZSA6ICFjYXB0dXJlKVxuICAgICAgICAgICAgICAgIC5tYXAoKFtwb3MsIF9dKSA9PiBwb3Mya2V5KHBvcykpO1xuICAgICAgICAgICAgZGVzdHMgPSBbLi4ubmV3IFNldChbLi4uZGVzdHNdKV07IC8vIHggYW5kIHkgbWF5IG92ZXJsYXAuXG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICBkZXN0cyA9IHByZW1vdmUoc3RhdGUuY2cuc3RhdGUucGllY2VzLCBrZXksIGZhbHNlKTtcbiAgICB9XG4gICAgY29uc3QgbW92ZXM6IE1vdmVbXSA9IFtdO1xuICAgIGZvciAoY29uc3QgZGVzdCBvZiBkZXN0cykge1xuICAgICAgICBpZiAoIWFsbG93Q2FwdHVyZSAmJiBzdGF0ZS5jZy5zdGF0ZS5waWVjZXMuaGFzKGRlc3QpKSBjb250aW51ZTtcbiAgICAgICAgZm9yIChjb25zdCB0cmFpbCBvZiBnZXRUcmFpbHNGb3JNb3ZlKHBpZWNlLnJvbGUsIGtleSwgZGVzdCkpIHtcbiAgICAgICAgICAgIGNvbnN0IG1vdmUgPSBhbmFseXplRnV0dXJlVHJhaWwoc3RhdGUsIHBpZWNlLCB0cmFpbCwgYWxsb3dDdXQsIGZhbHNlKTtcbiAgICAgICAgICAgIGlmICghbW92ZSkgY29udGludWU7XG4gICAgICAgICAgICBtb3Zlcy5wdXNoKG1vdmUpO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBtb3Zlcztcbn1cblxuZXhwb3J0IHR5cGUgVHJhaWwgPSBLZXlbXTtcblxuZnVuY3Rpb24gbW92ZXNUb0Rlc3RzKG1vdmVzTWFwOiBNYXA8S2V5LCBNb3ZlW10+KTogTWFwPEtleSwgS2V5W10+IHtcbiAgICBjb25zdCBkZXN0c01hcDogTWFwPEtleSwgS2V5W10+ID0gbmV3IE1hcCgpO1xuICAgIGZvciAoY29uc3QgW3MsIG1vdmVzXSBvZiBtb3Zlc01hcCkge1xuICAgICAgICBkZXN0c01hcC5zZXQocywgbW92ZXMubWFwKG0gPT4gbGFzdChtLnRyYWlsKSkpO1xuICAgIH1cbiAgICByZXR1cm4gZGVzdHNNYXA7XG59XG5cbmZ1bmN0aW9uIHBsYXlPdGhlclNpZGUoc3RhdGU6IFRyYWlsQ2hlc3NTdGF0ZSkge1xuICAgIGNvbnN0IGNvbG9yID0gb3Bwb3NpdGUoc3RhdGUuY29sb3IpO1xuICAgIHN0YXRlLmNvbG9yID0gY29sb3I7XG4gICAgc3RhdGUubW92ZXNNYXAgPSBnZXRBbGxNb3ZlcyhzdGF0ZSk7XG4gICAgc3RhdGUubGFzdE1vdmUgPSBzdGF0ZS5jZy5zdGF0ZS5sYXN0TW92ZTtcbiAgICBzdGF0ZS5jZy5zZXQoe1xuICAgICAgICB0dXJuQ29sb3I6IGNvbG9yLFxuICAgICAgICBtb3ZhYmxlOiB7XG4gICAgICAgICAgICBjb2xvcjogY29sb3IsXG4gICAgICAgICAgICBkZXN0czogbW92ZXNUb0Rlc3RzKHN0YXRlLm1vdmVzTWFwKVxuICAgICAgICB9XG4gICAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBbGxNb3ZlcyhzdGF0ZTogVHJhaWxDaGVzc1N0YXRlKTogTWFwPEtleSwgTW92ZVtdPiB7XG4gICAgY29uc3QgbW92ZXM6IE1hcDxLZXksIE1vdmVbXT4gPSBuZXcgTWFwKCk7XG4gICAgZm9yIChjb25zdCBzIG9mIHN0YXRlLmNnLnN0YXRlLnBpZWNlcy5rZXlzKCkpIHtcbiAgICAgICAgY29uc3QgcGllY2VNb3ZlcyA9IGdldE1vdmVzKHN0YXRlLCBzLCB0cnVlLCB0cnVlKTtcbiAgICAgICAgaWYgKHBpZWNlTW92ZXMubGVuZ3RoKSBtb3Zlcy5zZXQocywgcGllY2VNb3Zlcyk7XG4gICAgfVxuICAgIHJldHVybiBtb3Zlcztcbn1cbiJdfQ==
