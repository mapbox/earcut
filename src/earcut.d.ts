
// TypeScript type definitions to use for reference when porting Earcut to other languages

declare module "earcut" {
    export earcut.earcut;
}

declare module earcut {
    interface Point extends [number, number];
    interface Ring extends Array<Point>;
    interface Polygon extends Array<Ring>;

    interface Triangles extends Array<number>;

    interface Node {
        p: Point;
        prev: Node;
        next: Node;
        z: number;
        prevZ: Node;
        nextZ: Node;
    };

    function earcut(points: Polygon): Triangles;

    function linkedList(points: Ring, clockwise: boolean): Node;

    function filterPoints(start: Node): Node;
    function filterPoints(start: Node, end: Node): Node;

    function earcutLinked(ear: Node, triangles: Triangles);
    function earcutLinked(ear: Node, triangles: Triangles, minX: number, minY: number, size: number, pass: number);

    function isEar(ear: Node): boolean;
    function isEar(ear: Node, minX: number, minY: number, size: number): boolean;

    function cureLocalIntersections(start: Node, triangles: Triangles): Node;

    function splitEarcut(start: Node, triangles: Triangles);
    function splitEarcut(start: Node, triangles: Triangles, minX: number, minY: number, size: number);

    function eliminateHoles(points: Polygon, outerNode: Node): Node;
    function eliminateHole(holeNode: Node, outerNode: Node);
    function findHoleBridge(holeNode: Node, outerNode: Node);

    function indexCurve(start: Node, minX: number, minY: number, size: number);
    function sortLinked(list: Node);
    function zOrder(x: number, y: number, minX: number, minY: number, size: number): number;

    function getLeftmost(start: Node): Node;
    function isValidDiagonal(a: Node, b: Node): boolean;
    function intersectsPolygon(start: Node, a: Node, b: Node): boolean;
    function locallyInside(a: Node, b: Node): boolean;
    function middleInside(start: Node, a: Node, b: Node): boolean;
    function compareX(a: Node, b: Node): number;

    function orient(p: Point, q: Point, r: Point): number;
    function equals(p1: Point, p2: Point): boolean;
    function intersects(p1: Point, q1: Point, p2: Point, q2: Point): boolean;

    function splitPolygon(a: Node, b: Node): Node;
    function insertNode(point: Point, last: Node): Node;
}
