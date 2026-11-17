// Hand-written curriculum. Processed by build-lessons.js (positions validated, solutions computed by the engine).
const L = [];
let unit = '', cat = '';
function U(c, u) { cat = c; unit = u; }
function lesson(id, title, level, steps, extra) { L.push(Object.assign({ id, cat, unit, title, level, steps }, extra || {})); }
const info = (fen, text, o) => Object.assign({ t: 'info', fen, text }, o || {});
const move = (fen, text, accept, o) => Object.assign({ t: 'move', fen, text, accept }, o || {});
const mate = (fen, n, text, o) => Object.assign({ t: 'puzzle', fen, mate: n, text: text || ('White to move: checkmate in ' + n + '.') }, o || {});
const tactic = (fen, text, first, o) => Object.assign({ t: 'puzzle', fen, first, text }, o || {});
const goal = (fen, text, g, limit, o) => Object.assign({ t: 'goal', fen, text, goal: g, limit }, o || {});
const quiz = (fen, text, options, answer, explain, o) => Object.assign({ t: 'quiz', fen, text, options, answer, explain }, o || {});
const collect = (fen, text, o) => Object.assign({ t: 'collect', fen, text }, o || {});
const themeSet = (theme, n, text) => ({ t: 'set', theme, n, text });
const E = '8/8/8/8/8/8/8/8 w - - 0 1';
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// =====================================================================
U('basics', 'Rules of the Game');
lesson('b-board', 'The Chessboard', 0, [
  info(E, 'Chess is played on an 8×8 board of 64 squares. Columns are called <b>files</b> (a–h) and rows are called <b>ranks</b> (1–8). Every square has a name: its file letter plus its rank number.', { marks: ['a1', 'h8', 'e4'] }),
  info(E, 'The highlighted square is <b>e4</b>: file e, rank 4. White always starts on ranks 1 and 2, Black on ranks 7 and 8. A light square is always in the bottom-right corner ("light on the right").', { marks: ['e4'] }),
  quiz(E, 'What is the name of the highlighted square?', ['d5', 'e5', 'd4', 'c5'], 0, 'File d, rank 5 → d5.', { marks: ['d5'] }),
  quiz(E, 'What is the name of the highlighted square?', ['g2', 'b7', 'g7', 'b2'], 2, 'File g, rank 7 → g7.', { marks: ['g7'] }),
  info(START, 'This is the starting position. Rooks in the corners, then knights, bishops, and the queen on her own color (white queen on a light square, d1). Pawns stand in front.')
]);
lesson('b-rook', 'The Rook', 50, [
  info('8/8/8/8/3R4/8/8/8 w - - 0 1', 'The <b>rook</b> moves any number of squares in a straight line: up, down, left or right. It cannot jump over pieces. A rook is worth about <b>5 pawns</b>.', { arrows: ['d4d8', 'd4d1', 'd4a4', 'd4h4'] }),
  collect('8/8/8/8/1p1R2p1/8/8/8 w - - 0 1', 'Capture all the black pawns with your rook. The pawns do not move.'),
  collect('8/2p5/8/5p2/8/2R5/8/5p2 w - - 0 1', 'Capture all the pawns in as few moves as possible.'),
  collect('7p/8/1p6/8/4p3/8/p7/4R3 w - - 0 1', 'Plan the route! Try to beat the target number of moves.')
]);
lesson('b-bishop', 'The Bishop', 50, [
  info('8/8/8/8/3B4/8/8/8 w - - 0 1', 'The <b>bishop</b> moves diagonally any number of squares. A bishop always stays on squares of one color. Each side starts with a light-squared and a dark-squared bishop. Worth about <b>3 pawns</b>.', { arrows: ['d4h8', 'd4a7', 'd4a1', 'd4g1'] }),
  collect('8/8/5p2/8/3B4/8/1p6/8 w - - 0 1', 'Capture the pawns with your bishop.'),
  collect('7p/8/1p3p2/8/3p4/8/1B6/8 w - - 0 1', 'Capture all the pawns. Bishops are long-range pieces!'),
  quiz('8/8/8/8/3B4/8/8/8 w - - 0 1', 'Can this bishop (on a dark square) ever reach a light square?', ['Yes, in two moves', 'No, never', 'Only by capturing'], 1, 'A bishop never changes square color. That is why the two bishops complement each other.')
]);
lesson('b-queen', 'The Queen', 50, [
  info('8/8/8/8/3Q4/8/8/8 w - - 0 1', 'The <b>queen</b> combines rook and bishop: any number of squares in any straight line or diagonal. She is the most powerful piece, worth about <b>9 pawns</b>.', { arrows: ['d4d8', 'd4h8', 'd4h4', 'd4g1', 'd4d1', 'd4a1', 'd4a4', 'd4a7'] }),
  collect('8/1p4p1/8/8/3Q4/8/1p4p1/8 w - - 0 1', 'Capture all the pawns with the queen.'),
  collect('p6p/8/3p4/8/8/2p2p2/8/Q7 w - - 0 1', 'Collect all the pawns as fast as you can.')
]);
lesson('b-king', 'The King', 50, [
  info('8/8/8/8/3K4/8/8/8 w - - 0 1', 'The <b>king</b> moves one square in any direction. He is the most important piece: if your king is checkmated, you lose. The king can never move into check.', { arrows: ['d4d5', 'd4e5', 'd4e4', 'd4e3', 'd4d3', 'd4c3', 'd4c4', 'd4c5'] }),
  collect('8/8/8/3p4/2p5/3K4/8/8 w - - 0 1', 'Walk the king to capture both pawns.'),
  collect('8/8/1p6/8/4p3/8/2K3p1/8 w - - 0 1', 'Capture all the pawns with your king.')
]);
lesson('b-knight', 'The Knight', 50, [
  info('8/8/8/8/3N4/8/8/8 w - - 0 1', 'The <b>knight</b> moves in an "L": two squares in one direction and one to the side. It is the only piece that can <b>jump</b> over others. Worth about <b>3 pawns</b>. A knight always lands on the opposite square color.', { arrows: ['d4e6', 'd4f5', 'd4f3', 'd4e2', 'd4c2', 'd4b3', 'd4b5', 'd4c6'] }),
  collect('8/8/8/4p3/8/3N4/8/8 w - - 0 1', 'Capture the pawn. Knights need practice — count the L-shapes!'),
  collect('8/8/2p5/8/3p4/8/4N3/8 w - - 0 1', 'Capture both pawns.'),
  collect('8/1p6/8/2p5/8/3p4/8/N7 w - - 0 1', 'Knight tour: collect all three pawns.')
]);
lesson('b-pawn', 'The Pawn', 50, [
  info('8/8/8/8/8/8/4P3/8 w - - 0 1', 'The <b>pawn</b> moves straight forward one square. On its very first move it may advance <b>two squares</b>. Pawns never move backward.', { arrows: ['e2e3', 'e2e4'] }),
  move('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1', 'Move the pawn two squares forward.', ['e4']),
  info('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', 'Pawns <b>capture diagonally</b> forward — differently from how they move. The e4 pawn attacks d5 and f5.', { arrows: ['e4d5', 'e4f5'] }),
  move('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', 'Capture the black pawn.', ['exd5']),
  quiz('4k3/8/8/4p3/4P3/8/8/4K3 w - - 0 1', 'Can the white pawn on e4 move?', ['Yes, to e5', 'No, it is blocked', 'Yes, it can capture e5'], 1, 'A pawn cannot capture straight ahead, so two pawns facing each other block each other.')
]);
lesson('b-promotion', 'Pawn Promotion', 100, [
  info('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1', 'When a pawn reaches the last rank it <b>promotes</b>: it turns into a queen, rook, bishop or knight of your choice. Almost always you choose a queen.'),
  move('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1', 'Promote your pawn to a queen.', ['b8=Q', 'b8=Q+']),
  move('2r1k3/1P6/8/8/8/8/8/4K3 w - - 0 1', 'Promote by capturing the rook!', ['bxc8=Q+', 'bxc8=Q']),
  info('8/8/8/8/8/8/8/8 w - - 0 1', 'Promotion makes passed pawns extremely valuable in the endgame. A pawn that reaches the 7th rank is often worth as much as a piece.')
]);
lesson('b-check', 'Check', 100, [
  info('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'When a king is attacked it is in <b>check</b>. The player in check must get out of it immediately.'),
  move('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', 'Give check to the black king with your rook.', ['Ra8+']),
  info('4k3/8/8/8/1b6/8/8/4K3 w - - 0 1', 'There are three ways to escape check: <b>move</b> the king, <b>block</b> the attack, or <b>capture</b> the attacker. The bishop on b4 checks the white king.', { arrows: ['b4e1'] }),
  move('4k3/8/8/8/1b6/8/8/4K3 w - - 0 1', 'Get out of check by moving the king.', ['Ke2', 'Kf2', 'Kf1', 'Kd1']),
  move('4k3/8/8/8/1b6/8/8/1N2K3 w - - 0 1', 'Get out of check by blocking with the knight.', ['Nc3', 'Nd2']),
  move('4k3/8/8/8/1b6/2P5/8/4K3 w - - 0 1', 'Get out of check by capturing the bishop with the pawn.', ['cxb4'])
]);
lesson('b-mate', 'Checkmate', 150, [
  info('R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1', '<b>Checkmate</b>: the king is in check and there is no way to escape. The game ends immediately. Here the black king is mated: its own pawns block the escape squares.'),
  move('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'Checkmate in one move!', ['Ra8#']),
  move('k7/8/1K6/8/8/8/8/7Q w - - 0 1', 'Checkmate in one move with the queen.', 'mate'),
  move('7k/8/6K1/8/8/8/8/3R4 w - - 0 1', 'Checkmate in one.', 'mate'),
  move('k7/2R5/8/8/8/8/8/1R4K1 w - - 0 1', 'Checkmate in one with the two rooks.', ['Rb8#'])
]);
lesson('b-stalemate', 'Stalemate', 200, [
  info('k7/2Q5/1K6/8/8/8/8/8 b - - 0 1', '<b>Stalemate</b>: the side to move is <b>not</b> in check but has no legal move. The game is a <b>draw</b>! Here Black to move has no moves — a wasted win for White.'),
  quiz('k7/8/1K6/8/8/8/2Q5/8 w - - 0 1', 'White to move. Which move is a terrible mistake?', ['Qc7 (stalemate)', 'Qa2#', 'Qc8#'], 0, 'After Qc7 Black has no legal moves and is not in check: stalemate. Always check that the opponent has a move when you are winning!'),
  move('k7/8/1K6/8/8/8/2Q5/8 w - - 0 1', 'Find the checkmate instead.', 'mate')
]);
lesson('b-castling', 'Castling', 200, [
  info('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', '<b>Castling</b> moves the king two squares toward a rook, and the rook jumps to the other side of the king. It is the only move where two pieces move. It brings the king to safety and activates the rook.'),
  move('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', 'Castle kingside (short): move the king two squares toward the h1 rook.', ['O-O']),
  move('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1', 'Now castle queenside (long).', ['O-O-O']),
  quiz('r3k2r/pppp1ppp/8/8/1b6/8/PPP2PPP/R3K2R w KQkq - 0 1', 'Can White castle right now?', ['Yes, both sides', 'No — the king is in check', 'Only queenside'], 1, 'You cannot castle out of check, through check, or into check. Also not if the king or that rook has moved before.')
]);
lesson('b-enpassant', 'En Passant', 250, [
  info('4k3/8/8/4P3/8/8/8/4K3 b - - 0 1', '<b>En passant</b> ("in passing"): if a pawn moves two squares and lands next to an enemy pawn, that enemy pawn may capture it as if it had moved only one square. This is only allowed on the very next move.'),
  move('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1', 'Black: move the d-pawn two squares.', ['d5']),
  move('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2', 'Now capture en passant: the e5 pawn takes on d6.', ['exd6'])
]);
lesson('b-draws', 'Ways to Draw', 250, [
  info('8/8/8/8/8/2k5/8/2K1N3 w - - 0 1', 'A game is drawn by: <b>stalemate</b>, <b>insufficient material</b> (e.g. king + knight vs king), <b>threefold repetition</b> of a position, the <b>50-move rule</b> (50 moves each without a capture or pawn move), or by <b>agreement</b>.'),
  quiz('8/8/8/8/8/2k5/8/2K1B3 w - - 0 1', 'King and bishop vs king. What is the result?', ['White wins', 'Draw — insufficient material', 'Black wins'], 1, 'A lone bishop or knight cannot force checkmate.'),
  quiz('8/8/8/8/8/2k5/8/R1K5 w - - 0 1', 'King and rook vs king. What is the result?', ['Draw', 'White can force checkmate'], 1, 'King and rook can always force mate. You will learn the technique in the endgame section.'),
  info('8/8/8/8/8/2k5/8/2K1N3 w - - 0 1', 'Perpetual check is a common way to save a lost game: if you can keep giving check forever, the position repeats and the game is drawn.')
]);
lesson('b-values', 'Piece Values', 200, [
  info(START, 'Rough values: <b>pawn 1</b>, <b>knight 3</b>, <b>bishop 3</b>, <b>rook 5</b>, <b>queen 9</b>. The king is priceless. Use these numbers to decide whether a trade is good.'),
  quiz(E, 'You can trade your knight for the opponent\'s rook. Is that good?', ['Yes, you win 2 points ("the exchange")', 'No, a knight is better', 'It is equal'], 0, 'Rook (5) for knight (3) = +2. Winning a rook for a minor piece is called "winning the exchange".'),
  quiz(E, 'You give your queen for a rook and a bishop. Material-wise?', ['You lose 1 point', 'You win 1 point', 'Equal'], 0, 'Rook + bishop = 8, queen = 9. Close — position matters more than one point.'),
  quiz(E, 'Bishop vs three pawns?', ['Roughly equal', 'Bishop much better', 'Pawns much better'], 0, '3 vs 3 points. In the endgame the pawns are often stronger; in the middlegame the bishop.')
]);
lesson('b-notation', 'Chess Notation', 250, [
  info(START, 'Moves are written in <b>algebraic notation</b>: piece letter (K, Q, R, B, N; nothing for pawns) + destination square. <b>Nf3</b> = knight to f3. <b>e4</b> = pawn to e4. <b>x</b> means capture: <b>Bxe5</b>. <b>+</b> = check, <b>#</b> = checkmate, <b>O-O</b> = castle short, <b>O-O-O</b> = castle long.'),
  quiz(START, 'What does "Nxd5+" mean?', ['Knight captures on d5 with check', 'Knight moves to d5', 'Queen captures d5'], 0, 'N = knight, x = capture, d5 = square, + = check.'),
  quiz(START, 'What does "exd6" mean?', ['Pawn on e-file captures on d6', 'King to d6', 'Pawn moves from e to d without capturing'], 0, 'Pawn captures name the file the pawn came from.'),
  move(START, 'Play the move <b>e4</b>.', ['e4']),
  move('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'Play <b>Nf3</b>.', ['Nf3'])
]);
lesson('b-hanging', 'Capturing Free Pieces', 300, [
  info('4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1', 'A piece that is attacked and not defended is <b>hanging</b>. Capturing hanging pieces is the most basic skill in chess — and noticing your own hanging pieces is just as important.'),
  move('4k3/8/8/3n4/8/8/8/3QK3 w - - 0 1', 'Capture the hanging knight.', ['Qxd5']),
  move('4k3/8/2p5/3n4/8/8/8/3QK3 w - - 0 1', 'Now the knight is defended by the c6 pawn. Capturing it would lose your queen. Make a safe move instead (any queen move that is not Qxd5).', ['Qd2', 'Qd3', 'Qd4', 'Qe2', 'Qf3', 'Qg4', 'Qh5', 'Qc2', 'Qb3', 'Qa4', 'Qc1', 'Qb1', 'Qa1', 'Ke2', 'Kf2', 'Kf1', 'Kd2'], { reject: { 'Qxd5': 'cxd5 — you gave your queen for a knight!' } }),
  move('r3k3/8/8/8/8/8/6B1/4K3 w - - 0 1', 'Find the free piece.', ['Bxa8'])
]);
lesson('b-defend', 'Defending Your Pieces', 300, [
  info('4k3/8/8/2b5/8/8/3N4/4K3 w - - 0 1', 'When your piece is attacked you can: <b>move it</b>, <b>defend it</b>, <b>block</b> the attack, or <b>counter-attack</b>. First you must notice the threat! Ask after every opponent move: <i>"What does that move attack?"</i>'),
  move('4k3/8/8/8/1b6/8/3N4/6K1 w - - 0 1', 'The bishop attacks your knight on d2. Save the knight by moving it to a safe square.', ['Nf3', 'Nb3', 'Nc4', 'Ne4', 'Nf1', 'Nb1']),
  move('4k3/8/8/8/4r3/8/4N3/3K4 w - - 0 1', 'The rook attacks your knight on e2. Defend it with your king.', ['Kd2', 'Ke1'])
]);
lesson('b-thinking', 'How to Think: Checks, Captures, Threats', 400, [
  info(START, 'Before every move, strong players scan for <b>forcing moves</b> in this order: <b>Checks, Captures, Threats</b> — for both sides. Most tactics are found this way.'),
  info(START, 'Then do a <b>blunder check</b>: after your intended move, what are your opponent\'s checks, captures and threats? Is any of your pieces left undefended?'),
  quiz(E, 'Your opponent just moved. What should you ask first?', ['What is the threat?', 'Where can my queen go?', 'Can I castle?'], 0, 'Always ask what the opponent\'s last move wants. Most blunders come from missing a threat.'),
  move('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3', 'White threatens Qxf7#. Defend f7 with a safe move.', ['g6', 'Qe7', 'Qf6', 'Nh6'], { reject: { 'Nf6': 'Qxf7# — the knight blocks nothing! That is Scholar\'s mate.' } })
]);
lesson('b-exchange', 'Counting Attackers and Defenders', 450, [
  info('4k3/8/3p4/4n3/8/5N2/8/4K3 w - - 0 1', 'To know if a capture is safe, <b>count</b>: how many of your pieces attack the target, and how many defend it? Capture with the cheapest piece first.'),
  quiz('4k3/8/3p4/4n3/8/5N2/8/4K3 w - - 0 1', 'Should White play Nxe5?', ['No: dxe5 just trades knights', 'Yes, wins a knight', 'Yes, wins a pawn'], 0, 'One attacker vs one defender: Nxe5 dxe5 is an even trade, not a win.'),
  tactic('4k3/8/8/4n3/2B5/5N2/8/4K3 w - - 0 1', 'The knight on e5 is attacked by your knight and undefended. Win it!', 'Nxe5'),
  quiz(E, 'Your rook attacks a defended knight. Should you capture?', ['No — rook (5) for knight (3) loses 2 points', 'Yes, always capture', 'Only if it gives check'], 0, 'Low-value attacker vs high-value target is fine; high-value attacker vs defended low-value target loses material.')
]);

// =====================================================================
U('principles', 'Opening Principles');
lesson('op-center', 'Control the Center', 300, [
  info(START, 'The four central squares <b>d4, e4, d5, e5</b> are the most important. Pieces in the center control more squares and can reach both wings quickly.', { marks: ['d4', 'e4', 'd5', 'e5'] }),
  move(START, 'Start by occupying the center with a pawn.', ['e4', 'd4']),
  info('rnbqkbnr/pppppppp/8/8/3N4/8/8/8 w - - 0 1', 'A knight in the center attacks 8 squares; on the edge only 4, and in the corner only 2. "A knight on the rim is dim!"', { arrows: ['d4e6', 'd4f5', 'd4f3', 'd4e2', 'd4c2', 'd4b3', 'd4b5', 'd4c6'] }),
  quiz(START, 'Which first move fights for the center best?', ['e4', 'h4', 'a3', 'Na3'], 0, 'e4 occupies a central square and opens lines for the queen and bishop.')
]);
lesson('op-develop', 'Develop Your Pieces', 350, [
  info('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', '<b>Develop</b> = bring your knights and bishops off the back rank. Try to develop a new piece every move in the opening. Knights before bishops is a good rule of thumb.'),
  move('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', 'Develop a knight toward the center while attacking e5.', ['Nf3']),
  move('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', 'Develop the bishop to an active square.', ['Bc4', 'Bb5']),
  quiz(START, 'Which piece should usually NOT be developed early?', ['The queen', 'The knights', 'The bishops'], 0, 'An early queen gets chased by minor pieces, and you lose time.')
]);
lesson('op-castle', 'Castle Early', 350, [
  info('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 6 5', 'The king is unsafe in the center once lines open. <b>Castle early</b> (usually by move 10). Castling also connects your rooks.'),
  move('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 6 5', 'Castle now.', ['O-O']),
  quiz(E, 'After castling, which pawns should you avoid moving?', ['The pawns in front of your king', 'The central pawns', 'The a-pawn'], 0, 'The pawn shield protects your king. Every pawn move there creates a weakness.')
]);
lesson('op-queen', 'Don\'t Bring the Queen Out Early', 400, [
  info('rnb1kbnr/pppp1ppp/8/4p1q1/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 2 3', 'An early queen is a target. Each time it is attacked, it must move, and the opponent develops with tempo.'),
  move('rnb1kbnr/pppp1ppp/8/4p1q1/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 2 3', 'Develop with tempo: attack the queen with a piece while developing.', ['Nf3', 'd4']),
  quiz(E, 'What is a "tempo"?', ['A unit of time — one move', 'A type of pawn', 'A draw offer'], 0, 'Gaining a tempo means your opponent wastes a move (e.g. moving an attacked queen) while you develop.')
]);
lesson('op-pawns', 'Don\'t Move Too Many Pawns', 400, [
  info('rnbqkbnr/1pp1ppp1/p2p3p/8/3PP3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 4', 'Black has played only pawn moves (a6, d6, h6) and is behind in development. Use the first moves for a couple of central pawns and your pieces.'),
  quiz('rnbqkbnr/1pp1ppp1/p2p3p/8/3PP3/2N2N2/PPP2PPP/R1BQKB1R w KQkq - 0 4', 'Who is better developed?', ['White', 'Black', 'Equal'], 0, 'White has two knights out and two central pawns; Black has no pieces developed.')
]);
lesson('op-f7', 'The Weak f7 Square', 400, [
  info('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3', 'At the start, <b>f7</b> (and f2 for White) is defended only by the king. Many early attacks aim there: Scholar\'s mate, the Fried Liver, Legal\'s mate.', { marks: ['f7'], arrows: ['c4f7'] }),
  move('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', 'Black defended badly. Checkmate!', ['Qxf7#'])
]);
lesson('op-connect', 'Connect Your Rooks', 450, [
  info('r4rk1/ppp1qppp/2np1n2/2b1p1B1/2B1P1b1/2NP1N2/PPP1QPPP/R4RK1 w - - 0 9', 'Development is complete when all minor pieces are out, the king is castled and the queen has stepped off the back rank: the rooks are <b>connected</b> and can go to open files.'),
  quiz(E, 'Where do rooks belong?', ['On open or half-open files', 'In the corners forever', 'In front of pawns'], 0, 'Rooks need open lines. Put them where pawn exchanges will open a file.')
]);
lesson('op-gambit', 'Gambits: Time vs Material', 600, [
  info('rnbqkbnr/pppp1ppp/8/8/4Pp2/8/PPPP2PP/RNBQKBNR w KQkq - 0 3', 'A <b>gambit</b> sacrifices material (usually a pawn) for time, open lines, or a big center. In the King\'s Gambit White gives the f-pawn to open the f-file.'),
  quiz(E, 'When you accept a gambit, what is usually the best approach?', ['Develop quickly and return the pawn if needed', 'Hold the extra pawn at all costs', 'Move the queen to defend it'], 0, 'Greedily holding the pawn often costs too much time. Returning material at the right moment is a key skill.')
]);

// =====================================================================
U('mates', 'Checkmate Patterns');
lesson('m-qk', 'Queen Mates', 300, [
  info('1Q6/8/1K6/k7/8/8/8/8 b - - 0 1', 'The queen needs help from the king (or another piece) to mate. The classic finish: the queen directly in front of the enemy king, protected by your king — the <b>"kiss of death"</b>.'),
  mate('k7/8/1K6/8/8/8/8/2Q5 w - - 0 1', 1),
  mate('8/8/8/8/8/5K2/8/5k1Q w - - 0 1', 1),
  mate('7k/8/6K1/8/8/8/8/Q7 w - - 0 1', 1),
  mate('8/8/8/8/8/1k6/8/1K1Q4 w - - 0 1', 3)
]);
lesson('m-rook', 'Rook Mates (the box)', 300, [
  info('3k4/8/3K4/8/8/8/8/R7 w - - 0 1', 'A rook mates on the edge when the kings stand opposite each other: your king takes away the escape squares in front, the rook checks along the edge.'),
  mate('3k4/8/3K4/8/8/8/8/R7 w - - 0 1', 1),
  mate('k7/8/1K6/8/8/8/8/7R w - - 0 1', 1),
  mate('6k1/8/6K1/8/8/8/8/1R6 w - - 0 1', 1)
]);
lesson('m-ladder', 'Ladder Mate (two rooks)', 300, [
  info('1R4k1/R7/8/8/8/8/8/6K1 b - - 0 1', 'Two rooks (or rook and queen) mate alone by "climbing a ladder": one rook cuts off a rank, the other checks on the next rank.'),
  mate('6k1/R7/8/8/8/8/8/1R4K1 w - - 0 1', 1),
  mate('6k1/8/8/8/8/8/R7/1R4K1 w - - 0 1', 2),
  mate('8/8/8/3k4/8/8/R7/1R4K1 w - - 0 1', 6)
]);
lesson('m-backrank', 'Back-Rank Mate', 400, [
  info('3R2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', 'The king is trapped on its back rank by its own pawns. A rook or queen checks along the rank: mate. Prevention: make <b>luft</b> (an escape square) with h3/h6 at a calm moment.'),
  mate('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', 1),
  mate('3r2k1/5ppp/8/8/8/8/4RPPP/4R1K1 w - - 0 1', 2),
  mate('2r3k1/5ppp/8/8/8/8/5PPP/2R1R1K1 w - - 0 1', 1),
  themeSet('backRankMate', 4, 'Find the back-rank mates from real games.')
]);
lesson('m-smothered', 'Smothered Mate', 600, [
  info('6rk/5Npp/8/8/8/8/8/6K1 b - - 0 1', 'A knight mates a king that is completely surrounded by its own pieces. Usually in the corner.'),
  mate('6rk/6pp/8/6N1/8/8/8/6K1 w - - 0 1', 1),
  info('r5rk/5Npp/8/8/8/8/5PPP/6K1 b - - 0 1', '<b>Philidor\'s Legacy</b>: knight check, double check, then a queen sacrifice on g8 forces the rook to smother its own king.'),
  mate('4r1k1/6pp/8/6N1/8/8/6PP/3Q2K1 w - - 0 1', 5),
  themeSet('smotheredMate', 3, 'Smothered mates from real games.')
]);
lesson('m-anastasia', 'Anastasia\'s Mate', 700, [
  info('8/4Nppk/8/8/8/8/8/K6R b - - 0 1', 'A knight on e7 controls g6 and g8; a rook or queen mates on the h-file. The g7 pawn blocks the king.'),
  mate('8/4Nppk/8/8/8/8/8/K2R4 w - - 0 1', 1),
  mate('5r1k/4Nppp/8/7Q/8/3R4/6PP/6K1 w - - 0 1', 2)
]);
lesson('m-arabian', 'Arabian Mate', 600, [
  info('7k/7R/5N2/8/8/8/8/6K1 b - - 0 1', 'The oldest known mate: rook and knight in the corner. The knight protects the rook and covers g8.'),
  mate('7k/1R6/5N2/8/8/8/8/6K1 w - - 0 1', 1),
  mate('7k/8/p4N2/8/8/8/8/1R4K1 w - - 0 1', 2)
]);
lesson('m-boden', 'Boden\'s Mate', 800, [
  info('2kr4/p2n4/B1p5/8/5B2/8/8/6K1 b - - 0 1', 'Two bishops on criss-crossing diagonals mate a king that castled queenside, typically after a sacrifice on c6 or c3.'),
  mate('2kr4/p2n4/2p5/8/5B2/8/4B3/6K1 w - - 0 1', 1),
  mate('2kr4/pp1n4/2p5/8/5B2/2Q5/4B3/6K1 w - - 0 1', 2)
]);
lesson('m-epaulette', 'Epaulette Mate', 600, [
  info('3rkr2/8/4Q3/8/8/8/8/4K3 b - - 0 1', 'The king is flanked by its own rooks like epaulettes on a uniform. The queen mates from two squares in front.'),
  mate('3rkr2/8/8/8/8/8/4Q3/4K3 w - - 0 1', 1)
]);
lesson('m-opera', 'Opera Mate', 700, [
  info('3Rkb1r/p4ppp/4q3/6B1/8/8/PPP2PPP/6K1 b - - 0 1', 'Named after Morphy\'s famous Opera Game (1858): a rook mates on the back rank, protected by a bishop that also covers the escape square.'),
  mate('4kb1r/p4ppp/4q3/6B1/8/8/PPP2PPP/3R2K1 w - - 0 1', 1)
]);
lesson('m-lolli', 'Lolli\'s Mate & Kiss of Death', 700, [
  info('5rk1/5pQp/5Pp1/8/8/8/8/6K1 b - - 0 1', 'A pawn on f6 supports the queen on g7. Very common after a kingside fianchetto is weakened.'),
  mate('5rk1/5p1p/5PpQ/8/8/8/8/6K1 w - - 0 1', 1),
  themeSet('queenMate', 3, 'Queen mates supported by another piece.')
]);
lesson('m-damiano', 'Damiano\'s Mate', 700, [
  info('5rk1/5p1Q/6P1/8/8/8/8/6K1 b - - 0 1', 'A pawn on g6 supports the queen on h7. Often prepared by rook sacrifices on h8 to open the h-file.'),
  mate('5rk1/5p2/6PQ/8/8/8/8/6K1 w - - 0 1', 1)
]);
lesson('m-greco', 'Greco\'s Mate', 700, [
  info('5r1k/6p1/8/8/2B4Q/8/8/6K1 b - - 0 1', 'A bishop on the a2-g8 diagonal covers g8, and a queen or rook mates on the h-file.'),
  mate('5r1k/6p1/8/8/2B5/8/8/4Q1K1 w - - 0 1', 1)
]);
lesson('m-morphy', 'Morphy\'s & Pillsbury\'s Mates', 700, [
  info('7k/7p/8/8/8/8/1B6/6RK b - - 0 1', 'A rook on the g-file and a bishop on the long diagonal cooperate against a king in the corner.'),
  mate('7k/7p/8/8/8/B7/8/6RK w - - 0 1', 1),
  themeSet('bishopMate', 3, 'Bishop mates from real games.')
]);
lesson('m-anderssen', 'Anderssen\'s Mate', 700, [
  info('6kR/6P1/5K2/8/8/8/8/8 b - - 0 1', 'A rook mates on the back rank, protected by a pawn (or bishop) on the 7th.'),
  mate('6k1/6P1/5K2/8/8/8/8/7R w - - 0 1', 1)
]);
lesson('m-corner', 'Corner Mate (rook + knight)', 700, [
  info('7k/5N1p/8/8/8/8/8/6RK b - - 0 1', 'The rook controls the g-file and the knight checks a king trapped in the corner by its own pawn.'),
  mate('7k/7p/8/6N1/8/8/8/6RK w - - 0 1', 1)
]);
lesson('m-blackburne', 'Blackburne\'s Mate', 900, [
  info('5rk1/5p1B/8/6N1/8/8/1B6/6K1 b - - 0 1', 'Two bishops and a knight: one bishop on the long diagonal, the other checks on h7 protected by the knight.'),
  mate('5rk1/5p2/8/6N1/8/3B4/1B6/6K1 w - - 0 1', 1)
]);
lesson('m-pawnmate', 'David and Goliath (Pawn Mate)', 800, [
  info('8/8/7p/5P1k/5KPp/8/8/8 b - - 0 1', 'Even a humble pawn can deliver mate when the enemy king is boxed in.'),
  mate('8/8/7p/5P1k/5K1p/6P1/8/8 w - - 0 1', 1),
  themeSet('pawnMate', 2, 'Pawn mates from real games.')
]);
lesson('m-rookmates', 'Rook Mates in Practice', 800, [
  themeSet('rookMate', 4, 'Rooks mating in real game positions.')
]);
lesson('m-knightmates', 'Knight Mates in Practice', 800, [
  themeSet('knightMate', 4, 'Knights delivering mate in real game positions.')
]);

// =====================================================================
U('tactics', 'Tactical Motifs');
lesson('t-fork', 'The Fork', 500, [
  info('2q3k1/5ppp/8/3N4/8/8/5PPP/6K1 w - - 0 1', 'A <b>fork</b> is one piece attacking two or more targets at once. The opponent can only save one. Knights are the best forkers because their attack cannot be blocked.'),
  tactic('2q3k1/5ppp/8/3N4/8/8/5PPP/6K1 w - - 0 1', 'Find the knight fork that wins the queen.', 'Ne7+'),
  tactic('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'Fork the king and the rook.', 'Nc7+'),
  tactic('7k/8/2n1r3/8/3P4/8/8/7K w - - 0 1', 'Pawns fork too! Attack two pieces at once.', 'd5'),
  themeSet('fork', 6, 'Forks from real games.')
]);
lesson('t-pin', 'The Pin', 550, [
  info('4k3/8/2n5/1B6/3P4/8/8/4K3 w - - 0 1', 'A <b>pin</b>: a piece cannot move (or should not) because a more valuable piece stands behind it. An <b>absolute pin</b> is against the king — the pinned piece may not legally move.', { arrows: ['b5e8'] }),
  tactic('4k3/8/2n5/1B6/3P4/8/8/4K3 w - - 0 1', '"Pin and win": attack the pinned knight.', 'd5'),
  quiz(E, 'What is the main way to exploit a pin?', ['Attack the pinned piece again, ideally with a pawn', 'Trade the pinning piece immediately', 'Ignore it'], 0, 'A pinned piece cannot run away, so pile up on it.'),
  themeSet('pin', 5, 'Pins from real games.')
]);
lesson('t-skewer', 'The Skewer', 600, [
  info('8/8/8/8/3k3q/1P6/8/R1K5 w - - 0 1', 'A <b>skewer</b> is a reverse pin: the more valuable piece is in front. When it moves away, the piece behind it is captured.'),
  tactic('8/8/8/8/3k3q/1P6/8/R1K5 w - - 0 1', 'Skewer the king and queen.', 'Ra4+'),
  themeSet('skewer', 4, 'Skewers from real games.')
]);
lesson('t-discovered', 'Discovered Attack', 650, [
  info('4k3/8/8/2q5/4N3/8/8/4R2K w - - 0 1', 'A <b>discovered attack</b>: one piece moves out of the way and unleashes an attack by the piece behind it. If the unmasked piece gives check, it is a <b>discovered check</b> — the moving piece can then do anything it wants.', { arrows: ['e1e8'] }),
  tactic('4k3/8/8/2q5/4N3/8/8/4R2K w - - 0 1', 'Discovered check — win the queen.', 'Nxc5+'),
  themeSet('discoveredAttack', 6, 'Discovered attacks from real games.')
]);
lesson('t-doublecheck', 'Double Check', 800, [
  info('4k3/8/5N2/8/8/8/8/4R2K b - - 0 1', 'In a <b>double check</b> two pieces give check at once. Blocking or capturing cannot stop both — the king must move. Double checks are the most powerful tactical weapon.'),
  themeSet('doubleCheck', 4, 'Double checks from real games.')
]);
lesson('t-hanging', 'Hanging Pieces in Real Games', 400, [
  info(E, 'Most games below 1500 are decided by pieces left undefended. These puzzles come from real games — the opponent just blundered. Spot it!'),
  themeSet('hangingPiece', 8, 'Capture what was left hanging.')
]);
lesson('t-sacrifice', 'The Sacrifice', 1100, [
  info(E, 'A <b>sacrifice</b> gives up material on purpose to get something bigger: a mating attack, a promotion, or more material back. Calculate forcing lines to the end before sacrificing.'),
  themeSet('sacrifice', 6, 'Sacrifices that work.')
]);
lesson('t-attraction', 'Attraction (Decoy)', 1200, [
  info(E, '<b>Attraction</b> lures the enemy king or another piece to a bad square with a sacrifice — often onto a square where it can be forked or mated.'),
  themeSet('attraction', 4, 'Decoy the king!')
]);
lesson('t-deflection', 'Deflection & Removing the Defender', 1100, [
  info('2r3k1/5ppp/8/8/8/1Q6/5PPP/2R3K1 w - - 0 1', '<b>Deflection</b> forces a defending piece away from its duty. <b>Removing the defender</b> captures it. Ask: "Which enemy piece is doing an important job? Can I distract or eliminate it?"'),
  quiz(E, 'A rook defends the back rank AND a knight. What is it?', ['Overloaded', 'Pinned', 'Trapped'], 0, 'An overloaded piece has too many jobs. Attack one of them and the other collapses.'),
  themeSet('advantage', 6, 'Mixed tactics: find the winning idea.')
]);
lesson('t-overload', 'Overloading', 1200, [
  info(E, 'A piece is <b>overloaded</b> when it must defend two things at once. Capture one of them — when it recaptures, the other is undefended.'),
  themeSet('crushing', 6, 'Crushing tactics.')
]);
lesson('t-promotion', 'Promotion Tactics', 900, [
  info('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1', 'Passed pawns on the 7th create tactics: deflect the blocker, sacrifice to break through, or underpromote to avoid stalemate or deliver a knight check.'),
  themeSet('promotion', 5, 'Promote your pawn!')
]);
lesson('t-zwischenzug', 'Zwischenzug (In-Between Move)', 1400, [
  info(E, 'A <b>zwischenzug</b> is an in-between move: instead of the expected recapture, you first play a forcing move (check or bigger threat), then recapture. It often changes the whole evaluation.'),
  quiz(E, 'When is an in-between move most likely?', ['When a check or a bigger threat is available before recapturing', 'In the opening only', 'Never in the endgame'], 0, 'Always check for forcing moves before automatically recapturing.'),
  themeSet('long', 5, 'Long combinations.')
]);
lesson('t-xray', 'X-Ray and Interference', 1500, [
  info(E, 'An <b>x-ray</b> attack works through another piece: a rook "sees" through an enemy rook along a file. <b>Interference</b> places a piece between two enemy pieces to cut their communication.'),
  themeSet('short', 6, 'Two-move combinations.')
]);
lesson('t-endgame-tactics', 'Endgame Tactics', 1000, [
  info(E, 'In endgames, tactics revolve around passed pawns, king positions and stalemate tricks. Count carefully: one tempo decides.'),
  themeSet('endgame', 6, 'Tactics in the endgame.')
]);
lesson('t-opening-tactics', 'Opening Tactics', 700, [
  info(E, 'In the opening, undeveloped pieces and uncastled kings give chances for quick tactics. Punish your opponent\'s mistakes immediately.'),
  themeSet('opening', 6, 'Tactics in the first moves.')
]);
lesson('t-quiet', 'Quiet Moves', 1600, [
  info(E, 'The hardest tactics start with a <b>quiet move</b> — no check, no capture — that creates an unstoppable threat. Strong players look for these after checking all forcing moves.'),
  themeSet('quietMove', 5, 'Find the quiet killer move.')
]);

// =====================================================================
U('strategy', 'Middlegame Strategy');
const S = (id, title, level, steps) => lesson(id, title, level, steps);
S('s-activity', 'Piece Activity', 900, [
  info('r1b2rk1/pp3ppp/2n1pn2/q1bp4/2P5/P1N1PN2/1PQB1PPP/R3KB1R w KQ - 0 9', 'The simplest strategic rule: <b>improve your worst piece</b>. An active piece controls many squares and creates threats; a passive one just defends.'),
  quiz(E, 'Which knight is more active?', ['A knight on d5 supported by a pawn', 'A knight on a3', 'A knight on h1'], 0, 'Central, supported, and impossible to chase away by pawns: that is an ideal knight.'),
  info(E, 'Count the squares your pieces control. If one piece controls far fewer squares than the others, find a route to a better square — even if it takes several moves.')
]);
S('s-bishops', 'Good and Bad Bishops', 1000, [
  info('6k1/5p2/4p1p1/3pP1P1/3P4/2B5/5K2/8 w - - 0 1', 'A bishop is <b>bad</b> when its own pawns are fixed on its color, blocking it. Here the c3 bishop is bad — White\'s pawns on d4 and e5 stand on dark squares. A <b>good</b> bishop moves freely in front of its pawns.'),
  quiz(E, 'Your bishop is light-squared. On what color should your pawns usually stand?', ['Dark squares', 'Light squares', 'It does not matter'], 0, 'Put pawns on the opposite color of your bishop so they complement each other.'),
  info(E, 'Plans with a bad bishop: trade it, bring it outside the pawn chain (like the French ...Bd7-e8-h5), or change the pawn structure.')
]);
S('s-outposts', 'Knight Outposts', 1000, [
  info('r4rk1/pp3ppp/3p4/2pN4/2P1P3/8/PP3PPP/R4RK1 w - - 0 1', 'An <b>outpost</b> is a square that can no longer be attacked by enemy pawns, ideally supported by your own pawn. A knight on d5 here is a monster.', { marks: ['d5'] }),
  quiz(E, 'What makes a square a true outpost?', ['No enemy pawn can ever attack it', 'It is in the center', 'It is next to the king'], 0, 'If an enemy pawn can kick the piece away, it is not a permanent outpost.'),
  info(E, 'Knights love outposts on the 5th and 6th ranks. Bishops are less effective there since they can be blocked.')
]);
S('s-openfiles', 'Open Files and Rooks', 1000, [
  info('3r1rk1/pp3ppp/8/8/8/8/PP3PPP/3R1RK1 w - - 0 1', 'A file without pawns is <b>open</b>. Rooks belong on open files. Whoever controls the open file can invade the 7th rank. Double rooks to fight for it.'),
  quiz(E, 'A file with only an enemy pawn on it is called?', ['Half-open (semi-open)', 'Closed', 'Diagonal'], 0, 'Half-open files are great for rooks: they pressure the enemy pawn.')
]);
S('s-seventh', 'The 7th Rank', 1100, [
  info('6k1/1R3ppp/8/8/8/8/5PPP/6K1 w - - 0 1', 'A rook on the 7th rank attacks pawns from the side and cages the enemy king. Two rooks on the 7th ("pigs on the seventh") often win by force.'),
  quiz(E, 'Why is a rook on the 7th so strong?', ['It attacks unmoved pawns and traps the king on the 8th', 'It can promote', 'It defends your king'], 0, 'Pawns on their starting squares can only be defended by pieces.')
]);
S('s-iqp', 'The Isolated Queen\'s Pawn', 1300, [
  info('r1bq1rk1/pp2bppp/2n1pn2/8/3P4/2NB1N2/PP3PPP/R1BQ1RK1 w - - 0 9', 'An <b>isolated pawn</b> has no friendly pawns on neighboring files. The IQP (on d4) gives its owner space, open lines and the e5 outpost — but in the endgame it is a weakness.'),
  quiz(E, 'With the IQP you should...', ['Attack in the middlegame and keep pieces on', 'Trade pieces quickly', 'Push it at all costs'], 0, 'Activity is the compensation. Every trade makes the weakness more serious.'),
  quiz(E, 'Against the IQP you should...', ['Blockade the square in front of it and trade pieces', 'Attack your opponent\'s king', 'Open the center'], 0, 'Nimzowitsch: "First restrain, then blockade, then destroy." A knight on d5 is the ideal blockader.')
]);
S('s-doubled', 'Doubled Pawns', 1100, [
  info('r1bqkb1r/pp3ppp/2p2n2/4p3/4P3/8/PPP2PPP/RNBQKB1R w KQkq - 0 6', 'Doubled pawns (two on one file) can\'t protect each other and are hard to use for creating a passed pawn. But they also open files and may control important squares.'),
  quiz(E, 'Doubled pawns are...', ['Usually a weakness, but can give open files and central control', 'Always a disaster', 'Always good'], 0, 'Judge concretely: what you get in return (bishop pair, open file, center) matters.')
]);
S('s-backward', 'Backward Pawns', 1300, [
  info('r1bq1rk1/1p3ppp/p2p1n2/4p3/4P3/1NN5/PPP2PPP/R2QKB1R w KQ - 0 10', 'A <b>backward pawn</b> (here d6) can\'t safely advance and can\'t be defended by other pawns. The square in front (d5) becomes a strong outpost for the opponent.'),
  quiz(E, 'What is the key square against a backward d6 pawn?', ['d5', 'd7', 'e6'], 0, 'Control and occupy the square in front of the backward pawn.')
]);
S('s-passed', 'Passed Pawns', 1000, [
  info('6k1/5ppp/8/3P4/8/8/5PPP/6K1 w - - 0 1', 'A <b>passed pawn</b> has no enemy pawns in front of it or on adjacent files. "Passed pawns must be pushed!" They tie down enemy pieces and become stronger as pieces come off.'),
  quiz(E, 'Where does a rook belong in relation to a passed pawn?', ['Behind it (yours or the enemy\'s)', 'In front of it', 'Next to it'], 0, 'Tarrasch\'s rule: rooks belong behind passed pawns. The rook behind gains activity as the pawn advances.'),
  quiz(E, 'What is the best blockader of a passed pawn?', ['A knight', 'A queen', 'A rook'], 0, 'A knight blockades well and still attacks squares; a queen as blockader is wasted.')
]);
S('s-majority', 'Pawn Majorities', 1400, [
  info('6k1/pp3ppp/8/8/8/8/5PPP/6K1 w - - 0 1', 'A <b>majority</b> is more pawns on one wing than the opponent. A healthy majority can create a passed pawn. A queenside majority is especially strong in the endgame because it is far from both kings.'),
  quiz(E, 'How do you create a passed pawn from a majority?', ['Advance the pawn with no opponent in front first ("candidate" pawn)', 'Push the most advanced pawn first', 'Wait'], 0, 'Lead with the candidate — the pawn that has no enemy pawn directly opposing it.')
]);
S('s-chains', 'Pawn Chains', 1200, [
  info('rnbqkbnr/pp3ppp/4p3/2ppP3/3P4/8/PPP2PPP/RNBQKBNR w KQkq - 0 4', 'Pawns on a diagonal form a <b>chain</b>. Attack the chain at its <b>base</b> (here d4 for Black via ...c5; d5 or e6 for White via f4-f5). Play on the side where your chain points.'),
  quiz(E, 'In a pawn chain d4-e5 (White), White usually attacks on...', ['The kingside', 'The queenside', 'Nowhere'], 0, 'The chain points to the kingside, giving White more space there.')
]);
S('s-hanging', 'Hanging Pawns', 1600, [
  info('r2q1rk1/p3bppp/1p2pn2/2pp4/8/1P2PN2/PB1N1PPP/R2Q1RK1 w - - 0 11', '<b>Hanging pawns</b> are two side-by-side pawns (c5 and d5) with no pawn neighbors. They control a lot of space but can become targets. If one advances, the other may become backward.'),
  quiz(E, 'Against hanging pawns you should...', ['Pressure them with pieces to force one to advance', 'Ignore them', 'Trade queens immediately'], 0, 'Making them advance creates holes and a backward pawn.')
]);
S('s-weak', 'Weak Squares and Holes', 1300, [
  info('rnbq1rk1/ppp1ppbp/3p1np1/8/2PPP3/2N2N2/PP2BPPP/R1BQK2R w KQ - 0 6', 'A <b>hole</b> is a square that can never be defended by a pawn again. Every pawn move leaves holes behind. Plan to put your pieces on the enemy\'s holes.'),
  quiz(E, 'After ...g6 the squares f6 and h6 become...', ['Potential holes (weak dark squares)', 'Stronger', 'Unchanged'], 0, 'That is why trading the fianchetto bishop is dangerous for the defender.')
]);
S('s-kingsafety', 'King Safety', 1000, [
  info('r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7', 'The pawn shield (f2-g2-h2) protects the castled king. Don\'t push those pawns without a reason. Keep a defending knight on f3/f6. When the center is open, the king must be castled.'),
  quiz(E, 'Which factor makes an attack on the king most dangerous?', ['More attackers than defenders near the king', 'Having the bishop pair', 'Having more pawns'], 0, 'Count attackers and defenders in the king zone.')
]);
S('s-opposite', 'Opposite-Side Castling', 1300, [
  info('2kr3r/ppp2ppp/2n5/8/8/8/PPP2PPP/R4RK1 w - - 0 1', 'With kings on opposite sides, both players storm with pawns. Speed is everything: pawn storms are cheap because they don\'t weaken your own king.'),
  quiz(E, 'With opposite-side castling, what should you prioritize?', ['Your own attack — be faster', 'Defense on your king side', 'Trading queens'], 0, 'Usually the faster attack wins. Open files toward the enemy king with pawn sacrifices.')
]);
S('s-space', 'Space Advantage', 1300, [
  info('r1bq1rk1/pp1nbppp/2p1p3/3pP3/2PP4/2N2N2/PP3PPP/R1BQKB1R w KQ - 0 8', 'More space means more room to maneuver. The side with less space should seek exchanges; the side with more space should avoid them and keep the bind.'),
  quiz(E, 'You are cramped. What helps?', ['Exchanging pieces', 'Keeping all pieces', 'Moving the king to the center'], 0, 'Fewer pieces need less room.')
]);
S('s-bishoppair', 'The Bishop Pair', 1400, [
  info('4k3/pp3ppp/2n1p3/8/8/4P3/PP2BPPP/2B1K3 w - - 0 1', 'Two bishops together cover both colors and are especially strong in open positions and endgames. Open the position when you have the bishops.'),
  quiz(E, 'With the bishop pair against bishop and knight you want...', ['An open position', 'A closed position', 'To trade a bishop quickly'], 0, 'Open lines favor long-range bishops.')
]);
S('s-exchanges', 'When to Trade', 1300, [
  info(E, 'Trade pieces when: you are ahead in material, you are cramped, you trade your bad piece for a good one, or you trade attackers when defending. Avoid trades when you are attacking or behind in material.'),
  quiz(E, 'You are a piece up. What should you do?', ['Trade pieces (not pawns)', 'Avoid all trades', 'Trade pawns only'], 0, 'Each trade makes your extra piece relatively more powerful.'),
  quiz(E, 'You are attacking the enemy king. Should you trade queens?', ['No — keep attacking pieces', 'Yes, always', 'Only if it wins a pawn'], 0, 'The queen is the main attacker.')
]);
S('s-prophylaxis', 'Prophylaxis', 1600, [
  info(E, '<b>Prophylaxis</b>: before making your plan, ask "What does my opponent want to do?" and prevent it. Karpov and Petrosian were masters at it. Moves like h3 (stopping ...Bg4) or a4 (stopping ...b5) are prophylactic.'),
  quiz(E, 'Why do players play h3 in the Ruy Lopez before d4?', ['To stop ...Bg4 pinning the f3 knight', 'To attack', 'To prepare h4'], 0, 'Prevent the opponent\'s most useful move.')
]);
S('s-minority', 'The Minority Attack', 1700, [
  info('r1b2rk1/pp2bppp/2p2n2/3p4/1P1P4/2NBPN2/P4PPP/R2Q1RK1 w - - 0 12', 'In the Carlsbad structure, White advances two queenside pawns (b4-b5) against Black\'s three (a7-b7-c6) to create a weakness on c6 or d5.'),
  quiz(E, 'What is the goal of the minority attack?', ['To create a weak pawn in the enemy majority', 'To promote a pawn', 'To checkmate'], 0, 'After b5xc6, Black is left with a backward c-pawn or an isolated d-pawn.')
]);
S('s-twoweak', 'The Principle of Two Weaknesses', 1800, [
  info(E, 'One weakness can often be defended. A winning plan creates a <b>second weakness</b> on the other side of the board, stretching the defense until it breaks.'),
  quiz(E, 'Your opponent defends a weak pawn well. What next?', ['Create a second target on the other wing', 'Repeat moves', 'Sacrifice everything'], 0, 'The defender can\'t cover both wings at once.')
]);
S('s-centralize', 'Centralization', 1100, [
  info(E, 'Centralized pieces — especially the king in the endgame and the queen and knights in the middlegame — influence both wings. When unsure, improve your piece\'s central control.'),
  quiz(E, 'In the endgame, the king should be...', ['Centralized and active', 'Hidden in the corner', 'Next to the rooks'], 0, 'The king is a strong piece in the endgame — worth about 4 pawns of activity.')
]);
S('s-initiative', 'Initiative and Tempo', 1500, [
  info(E, 'The <b>initiative</b> means making threats your opponent must answer. The side with the initiative dictates the game. Sometimes a pawn sacrifice is worth it to keep making threats.'),
  quiz(E, 'Which move keeps the initiative best?', ['One that creates a threat while improving a piece', 'A slow pawn move', 'Retreating your best piece'], 0, 'Tempo moves gain time.')
]);
S('s-planning', 'Making a Plan: Imbalances', 1500, [
  info(E, 'To find a plan, list the <b>imbalances</b>: material, pawn structure, piece activity, king safety, space, development, minor pieces (bishop vs knight), open files. Then play where your advantages are.'),
  quiz(E, 'You have a queenside majority and the opponent has a kingside attack. What is your plan?', ['Defend the kingside and push the queenside majority', 'Attack the kingside too', 'Do nothing'], 0, 'Neutralize the opponent\'s trump, then use yours.')
]);
S('s-converting', 'Converting an Advantage', 1600, [
  info(E, 'When winning: <b>don\'t rush</b>. Eliminate counterplay first, keep your pieces protected, trade down, and use your extra material. "The hardest game to win is a won game."'),
  quiz(E, 'You are an exchange up. The opponent has a dangerous passed pawn. First...', ['Stop the passed pawn', 'Attack the king', 'Push your own pawns'], 0, 'Remove counterplay first, then convert.')
]);
S('s-defense', 'Defending Worse Positions', 1600, [
  info(E, 'When worse: create problems, look for counterplay, trade attacking pieces, set traps, and look for fortresses and drawn endgames (opposite bishops, rook endings). Don\'t panic.'),
  quiz(E, 'Down a pawn, which endgame offers the best drawing chances?', ['Opposite-colored bishops', 'Queen endgame', 'Knight endgame'], 0, 'Opposite-colored bishops are famously drawish.')
]);
S('s-candidates', 'Calculation: Candidate Moves', 1400, [
  info(E, 'Calculation method: 1) list <b>candidate moves</b> (forcing moves first), 2) calculate each a few moves deep, 3) evaluate the final positions, 4) choose. Don\'t jump back and forth — calculate each line once, clearly.'),
  quiz(E, 'Which candidate moves should you consider first?', ['Checks, captures and threats', 'Pawn moves', 'King moves'], 0, 'Forcing moves limit the opponent\'s replies and are easier to calculate.')
]);
S('s-practical', 'Practical Play & Time Management', 1200, [
  info(E, 'Spend time on critical moments (when the position changes character, or there are tactics), play the opening and simple recaptures quickly. In time trouble, play safe moves. Always use the blunder check before pressing the clock.'),
  quiz(E, 'When should you think the longest?', ['At critical moments with tactics or big decisions', 'On move 1', 'When recapturing'], 0, 'Recognize critical positions and invest your time there.')
]);

// =====================================================================
U('endgames', 'Endgames');
lesson('e-kqk', 'Mate with Queen and King', 500, [
  info('8/8/8/4k3/8/8/8/4K2Q w - - 0 1', 'Technique: use the queen to shrink the king\'s box (stay a knight\'s move away from the king), push it to the edge, then bring your king closer and mate. Watch out for <b>stalemate</b>!'),
  goal('8/8/8/4k3/8/8/8/4K2Q w - - 0 1', 'Checkmate the black king within 15 moves.', 'mate', 15),
  goal('8/8/8/8/8/2k5/8/K6Q w - - 0 1', 'Checkmate within 15 moves.', 'mate', 15),
  goal('3k4/8/8/8/8/8/8/Q6K w - - 0 1', 'Checkmate within 12 moves.', 'mate', 12)
]);
lesson('e-krk', 'Mate with Rook and King', 600, [
  info('8/8/8/4k3/8/8/8/R3K3 w - - 0 1', 'The rook cuts off the king along a rank or file. Bring your king up so the kings face each other (opposition), then check along the edge. If the rook is attacked, move it to the far side.'),
  goal('8/8/8/4k3/8/8/8/R3K3 w - - 0 1', 'Checkmate within 25 moves.', 'mate', 25),
  goal('8/8/3k4/8/8/8/8/6KR w - - 0 1', 'Checkmate within 25 moves.', 'mate', 25)
]);
lesson('e-krrk', 'Mate with Two Rooks', 400, [
  info('8/8/8/3k4/8/8/8/R3K2R w - - 0 1', 'The ladder: rooks alternate checks, pushing the king one rank at a time. Keep the rooks far from the enemy king so they can\'t be attacked.'),
  goal('8/8/8/3k4/8/8/8/R3K2R w - - 0 1', 'Checkmate within 10 moves.', 'mate', 10)
]);
lesson('e-kbbk', 'Mate with Two Bishops', 1500, [
  info('8/8/8/4k3/8/8/8/2B1KB2 w - - 0 1', 'Bishops side by side form a barrier. Drive the king to a corner using the bishops and your king, then mate. Requires patience — avoid stalemate.'),
  goal('8/8/8/4k3/8/8/8/2B1KB2 w - - 0 1', 'Checkmate within 40 moves.', 'mate', 40)
]);
lesson('e-kbnk', 'Mate with Bishop and Knight', 2000, [
  info('8/8/8/4k3/8/8/8/1N2KB2 w - - 0 1', 'The hardest basic mate. You can only mate in a corner of the bishop\'s color. Drive the king there with the "W-maneuver" of the knight.'),
  goal('7k/8/8/8/8/8/8/1N2KB2 w - - 0 1', 'Checkmate within 50 moves.', 'mate', 50)
]);
lesson('e-square', 'Rule of the Square', 600, [
  info('8/8/8/k7/8/8/6P1/K7 w - - 0 1', 'Can the king catch the pawn? Draw a square from the pawn to its promotion rank. If the defending king can step into the square on its move, it catches the pawn. Remember: a pawn on its start square can move two, so count from g4.', { marks: ['c4', 'g4', 'c8', 'g8'] }),
  goal('8/8/8/k7/8/8/6P1/K7 w - - 0 1', 'After g4 the black king cannot step into the square. Promote the pawn!', 'promote', 8),
  quiz('8/8/8/3k4/8/8/6P1/K7 w - - 0 1', 'Black to move after g4. Can the king on d5 catch the g-pawn?', ['Yes — it is inside the square', 'No'], 0, 'After g4 the square is d4–d8–g8–g4. The d5 king is inside: ...Ke6 catches it.')
]);
lesson('e-keysquares', 'Key Squares', 800, [
  info('8/8/8/8/4P3/8/8/4K1k1 w - - 0 1', 'Every pawn has <b>key squares</b>: if your king reaches one, the pawn promotes by force. For a pawn on the 4th rank they are the three squares two ranks ahead (d6, e6, f6).', { marks: ['d6', 'e6', 'f6'] }),
  goal('8/8/4k3/8/3K4/8/4P3/8 w - - 0 1', 'Your king already stands on a key square (d4) of the e2 pawn. Promote the pawn.', 'promote', 25),
  goal('8/8/8/3k4/8/3K4/3P4/8 b - - 0 1', 'Black to move must give way: you have the opposition. Reach a key square and promote.', 'promote', 25, { side: 'w' })
]);
lesson('e-opposition', 'The Opposition', 700, [
  info('8/8/8/4k3/8/4K3/4P3/8 w - - 0 1', 'Kings facing each other with one square in between: the side that does <b>not</b> have to move "has the opposition". In pawn endgames, the opposition decides who gets through.'),
  goal('8/4k3/8/4K3/4P3/8/8/8 w - - 0 1', 'You are Black. White moves first, and you can keep the opposition: always answer by facing the white king. Hold the draw for 20 moves.', 'draw', 20, { side: 'b' }),
  info('4k3/8/4K3/4P3/8/8/8/8 b - - 0 1', 'But here the pawn is on the 5th rank with the king on the 6th: White wins whoever moves. The defending king must get in front of the pawn early, and take the opposition.')
]);
lesson('e-rookpawn', 'Rook Pawn Draws', 800, [
  info('7k/8/6K1/7P/8/8/8/8 b - - 0 1', 'With a rook pawn (a- or h-pawn), the defender draws easily if the king reaches the corner in front of the pawn. Stalemate tricks save the day.'),
  goal('7k/8/6K1/7P/8/8/8/8 b - - 0 1', 'Hold the draw as Black.', 'draw', 20, { side: 'b' })
]);
lesson('e-breakthrough', 'Pawn Breakthrough', 1300, [
  info('8/ppp5/8/PPP5/8/8/8/k6K w - - 0 1', 'Three pawns against three on the 5th rank: a sacrificial breakthrough creates a passed pawn that queens before the kings can intervene.'),
  goal('8/ppp5/8/PPP5/8/8/8/k6K w - - 0 1', 'Break through and promote a pawn.', 'promote', 8)
]);
lesson('e-outside', 'The Outside Passed Pawn', 1200, [
  info('8/5kpp/8/P7/8/6PP/5K2/8 w - - 0 1', 'An outside passed pawn deflects the enemy king. While it chases the pawn, your king eats the remaining pawns on the other side.'),
  goal('8/5kpp/8/P7/8/6PP/5K2/8 w - - 0 1', 'Use your outside passed pawn to win.', 'win', 40)
]);
lesson('e-triangulation', 'Triangulation', 1700, [
  info('8/8/2k5/1p1K4/1P6/8/8/8 w - - 0 1', '<b>Triangulation</b>: the king loses a tempo by walking a triangle, passing the move to the opponent. It works when the defender has fewer available squares.'),
  goal('8/8/3k4/1p1p4/1P1K4/8/8/8 w - - 0 1', 'Win the pawn endgame (hint: zugzwang).', 'win', 40, { nocheck: true })
]);
lesson('e-reti', 'The Réti Manoeuvre', 1600, [
  info('7K/8/k1P5/7p/8/8/8/8 w - - 0 1', 'The famous Réti study: White\'s king seems hopelessly far, but by walking diagonally it chases the h-pawn and supports its own pawn at the same time. Draw!'),
  goal('7K/8/k1P5/7p/8/8/8/8 w - - 0 1', 'Find the draw as White.', 'draw', 20)
]);
lesson('e-qvp', 'Queen vs Pawn on the 7th', 1500, [
  info('8/8/8/8/8/8/3pk3/7K w - - 0 1', 'Against a central or knight pawn on the 7th, the queen wins: check repeatedly to force the king in front of its pawn, then bring your king one step closer each time.'),
  goal('K7/8/8/8/8/8/3pk3/7Q w - - 0 1', 'Stop the pawn and win.', 'win', 40, { nocheck: true })
]);
lesson('e-lucena', 'Lucena Position: Building a Bridge', 1600, [
  info('1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', 'The most important winning position in rook endings. The king is stuck in front of its pawn. Solution: check the enemy king away, then <b>build a bridge</b> with the rook on the 4th rank to shield your king from checks.'),
  goal('1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1', 'Win the Lucena position (promote the pawn).', 'promote', 25)
]);
lesson('e-philidor', 'Philidor Position: Third-Rank Defense', 1600, [
  info('3k4/8/r7/3PK3/8/8/8/7R b - - 0 1', 'The key drawing method: keep your rook on your 3rd rank (6th from Black\'s view) so the white king can\'t advance. When the pawn moves forward, go behind it and check from far away.'),
  goal('3k4/8/r7/3PK3/8/8/8/7R b - - 0 1', 'Hold the draw as Black for 25 moves.', 'survive', 25, { side: 'b', nocheck: true })
]);
lesson('e-rookbehind', 'Rooks Behind Passed Pawns', 1300, [
  info('8/8/8/P7/8/5kp1/R5K1/r7 w - - 0 1', 'Rooks belong behind passed pawns — your own or your opponent\'s. A rook in front of a pawn is passive.'),
  quiz(E, 'Where should your rook be when you have a passed pawn?', ['Behind it', 'In front of it', 'On the other wing'], 0, 'From behind, it gains scope as the pawn advances.')
]);
lesson('e-cutoff', 'Cutting Off the King', 1400, [
  info('8/8/8/8/4k3/8/R3P3/4K3 w - - 0 1', 'In rook endings, cutting the enemy king off by a file or rank is often enough to win. The more files the king is cut off, the easier.'),
  goal('8/8/8/2k5/8/8/R3P3/4K3 w - - 0 1', 'The black king is cut off. Promote the e-pawn.', 'promote', 30, { nocheck: true })
]);
lesson('e-wrongbishop', 'Wrong-Colored Bishop', 1300, [
  info('7k/8/8/7P/8/8/8/2B1K3 b - - 0 1', 'Bishop + rook pawn whose promotion square is the wrong color for the bishop: if the defending king reaches the corner, it is a draw!'),
  goal('7k/8/8/8/7P/8/8/4KB2 b - - 0 1', 'Hold the draw as Black: get to the corner.', 'survive', 25, { side: 'b', nocheck: true })
]);
lesson('e-oppbishops', 'Opposite-Colored Bishops', 1500, [
  info('8/5k2/8/2b1P3/8/3B4/5K2/8 w - - 0 1', 'Opposite-colored bishops are very drawish: the defender blockades on squares of its bishop\'s color, where the attacker\'s bishop can never chase it away.'),
  quiz(E, 'Up a pawn with opposite-colored bishops in an endgame, the most likely result is...', ['Draw', 'Easy win', 'Loss'], 0, 'Even two extra pawns are sometimes not enough.')
]);
lesson('e-principles', 'Endgame Principles', 900, [
  info(E, '1) <b>Activate your king</b>. 2) <b>Create a passed pawn</b> and push it. 3) Rooks behind passed pawns. 4) Don\'t hurry — make sure the opponent has no counterplay. 5) Trade pieces, not pawns, when ahead.'),
  quiz(E, 'In a pawn-up endgame, what should you trade?', ['Pieces', 'Pawns', 'Nothing'], 0, 'Fewer pawns = fewer winning chances. Keep pawns, trade pieces.')
]);
lesson('e-pawnrace', 'Pawn Races', 900, [
  info('8/p7/8/8/8/8/7P/K6k w - - 0 1', 'In pawn races, count moves to promotion. Watch for a queen check on promotion, or a promotion that covers the enemy promotion square.'),
  goal('8/p6k/8/8/8/8/1P6/K7 w - - 0 1', 'Win the pawn race.', 'win', 30, { nocheck: true })
]);

module.exports = { lessons: L };
