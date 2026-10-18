using System.Collections.Generic;
using System.Text;
using UnityEditor;
using UnityEngine;

// Plans blood routes that only pass through hollow space (chambers, valve openings, vessel lumens), never muscle,
// and bakes them into each BloodFlowPath. Re-run from Tools > Cardiac Twin > Plan Blood Paths after moving seeds.
//
// The heart mesh is a closed surface cut open by a flat plane facing +z. Voxelised in root space:
//   tissue = inside the closed surface (z-column parity),
//   lumen  = empty space sealed off from the outside (the only opening is the cut face, which is the grid's front edge).
public static class BloodPathPlanner
{
    const float Cell = 0.001f;
    const float DiastoleTime = 0.65f;   // AV valves open — plan vein -> atrium -> ventricle
    const float SystoleTime = 0.12f;    // semilunar valves open — plan ventricle -> artery
    const float MinClear = 0.001f;      // narrowest gap a route may use (valve openings are ~1.5mm)
    // Crossing tissue is allowed only as a last resort: the model's vein stubs are solid and the aorta is a
    // separate capped tube, so blood must pass those hidden seams. Plan() reports any crossing visible from the front.
    const float TissueCost = 200f;
    const float SnapRadius = 0.012f;
    const float AvSealRadius = 0.008f;  // blocks the AV (mitral/tricuspid) orifice while the ventricle ejects
    const float ValveExitRadius = 0.006f; // visible space allowed just past the valve before a hidden outflow
    const float AvoidCost = 400f;         // > TissueCost: a hidden seam beats a visible detour

    public class Grid
    {
        public Vector3 min;
        public int nx, ny, nz;
        public float zCut;
        public bool[] tissue, lumen;
        public byte[] enclosed;   // how many of the 5 walled directions (behind, ±x, ±y) have tissue
        public byte[] front;      // tissue voxels between this one and the viewer; >= 2 = hidden from the front
        public float[] clear;

        public Vector3 Pos(int i)
        {
            int x = i % nx, y = (i / nx) % ny, z = i / (nx * ny);
            return min + new Vector3((x + 0.5f) * Cell, (y + 0.5f) * Cell, (z + 0.5f) * Cell);
        }

        public int IndexOf(Vector3 p)
        {
            int x = Mathf.FloorToInt((p.x - min.x) / Cell), y = Mathf.FloorToInt((p.y - min.y) / Cell), z = Mathf.FloorToInt((p.z - min.z) / Cell);
            if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) return -1;
            return (z * ny + y) * nx + x;
        }

        public float ClearAt(Vector3 p) { int i = IndexOf(p); return i < 0 || !lumen[i] ? 0f : clear[i]; }
    }

    [MenuItem("Tools/Cardiac Twin/Plan Blood Paths")]
    static void PlanMenu() => Debug.Log(Plan());

    public static Grid BuildAt(float time, out Transform root)
    {
        var heart = GameObject.Find("BeatingHeart");
        root = heart.transform;
        heart.GetComponent<Animation>().clip.SampleAnimation(heart, time);
        return Build(heart.GetComponentInChildren<SkinnedMeshRenderer>(), root);
    }

    public static Grid Build(SkinnedMeshRenderer smr, Transform root)
    {
        var mesh = new Mesh();
        smr.BakeMesh(mesh, true);
        var toRoot = root.worldToLocalMatrix * smr.transform.localToWorldMatrix;
        var src = mesh.vertices;
        var tris = mesh.triangles;
        Object.DestroyImmediate(mesh);
        var v = new Vector3[src.Length];
        var b = new Bounds(toRoot.MultiplyPoint3x4(src[0]), Vector3.zero);
        for (int i = 0; i < src.Length; i++) { v[i] = toRoot.MultiplyPoint3x4(src[i]); b.Encapsulate(v[i]); }

        var g = new Grid { zCut = CutPlaneZ(v, tris) };
        g.min = b.min - Vector3.one * 2f * Cell;
        g.nx = Mathf.CeilToInt((b.max.x - g.min.x) / Cell) + 2;
        g.ny = Mathf.CeilToInt((b.max.y - g.min.y) / Cell) + 2;
        g.nz = Mathf.FloorToInt((g.zCut - 0.0005f - g.min.z) / Cell);
        int n = g.nx * g.ny * g.nz;
        g.tissue = new bool[n];

        var cross = new List<float>[g.nx * g.ny];
        for (int t = 0; t < tris.Length; t += 3)
        {
            Vector3 a = v[tris[t]], c = v[tris[t + 1]], d = v[tris[t + 2]];
            float det = (c.y - d.y) * (a.x - d.x) + (d.x - c.x) * (a.y - d.y);
            if (Mathf.Abs(det) < 1e-14f) continue;
            int x0 = Mathf.Max(0, Mathf.FloorToInt((Mathf.Min(a.x, Mathf.Min(c.x, d.x)) - g.min.x) / Cell));
            int x1 = Mathf.Min(g.nx - 1, Mathf.FloorToInt((Mathf.Max(a.x, Mathf.Max(c.x, d.x)) - g.min.x) / Cell));
            int y0 = Mathf.Max(0, Mathf.FloorToInt((Mathf.Min(a.y, Mathf.Min(c.y, d.y)) - g.min.y) / Cell));
            int y1 = Mathf.Min(g.ny - 1, Mathf.FloorToInt((Mathf.Max(a.y, Mathf.Max(c.y, d.y)) - g.min.y) / Cell));
            for (int y = y0; y <= y1; y++)
            for (int x = x0; x <= x1; x++)
            {
                // tiny jitter so column centres never land exactly on a shared edge (would double-count)
                float px = g.min.x + (x + 0.5f) * Cell + 1.3e-7f, py = g.min.y + (y + 0.5f) * Cell + 0.7e-7f;
                float l1 = ((c.y - d.y) * (px - d.x) + (d.x - c.x) * (py - d.y)) / det;
                float l2 = ((d.y - a.y) * (px - d.x) + (a.x - d.x) * (py - d.y)) / det;
                float l3 = 1f - l1 - l2;
                if (l1 < 0f || l2 < 0f || l3 < 0f) continue;
                int col = y * g.nx + x;
                (cross[col] ??= new List<float>()).Add(l1 * a.z + l2 * c.z + l3 * d.z);
            }
        }
        for (int col = 0; col < cross.Length; col++)
        {
            var zs = cross[col];
            if (zs == null) continue;
            zs.Sort();
            int x = col % g.nx, y = col / g.nx;
            for (int k = 0; k + 1 < zs.Count; k += 2)
            {
                int z0 = Mathf.Max(0, Mathf.CeilToInt((zs[k] - g.min.z) / Cell - 0.5f));
                int z1 = Mathf.Min(g.nz - 1, Mathf.FloorToInt((zs[k + 1] - g.min.z) / Cell - 0.5f));
                for (int z = z0; z <= z1; z++) g.tissue[(z * g.ny + y) * g.nx + x] = true;
            }
        }

        // Walls thinner than a cell slip between parity samples; mark every voxel the surface passes through too.
        for (int t = 0; t < tris.Length; t += 3)
        {
            Vector3 a = v[tris[t]], c = v[tris[t + 1]], d = v[tris[t + 2]];
            float longest = Mathf.Max((c - a).magnitude, Mathf.Max((d - a).magnitude, (d - c).magnitude));
            int steps = Mathf.Max(1, Mathf.CeilToInt(longest / (Cell * 0.4f)));
            for (int i = 0; i <= steps; i++)
            for (int j = 0; j <= steps - i; j++)
            {
                var p = a + (c - a) * ((float)i / steps) + (d - a) * ((float)j / steps);
                int idx = g.IndexOf(p);
                if (idx >= 0) g.tissue[idx] = true;
            }
        }

        g.front = new byte[n];
        for (int y = 0; y < g.ny; y++)
        for (int x = 0; x < g.nx; x++)
        {
            int count = 0;
            for (int z = g.nz - 1; z >= 0; z--)
            {
                int i = (z * g.ny + y) * g.nx + x;
                g.front[i] = (byte)Mathf.Min(count, 255);
                if (g.tissue[i]) count++;
            }
        }

        // Lumen = empty voxel walled in by tissue behind it and on all four in-plane sides. The cutaway is not one
        // plane (some structures are cut deeper), so "sealed except the front" can't be found by flooding.
        var enclosed = new byte[n];
        Sweep(g, enclosed, 1, 0, 0); Sweep(g, enclosed, -1, 0, 0);
        Sweep(g, enclosed, 0, 1, 0); Sweep(g, enclosed, 0, -1, 0);
        Sweep(g, enclosed, 0, 0, 1);
        g.enclosed = enclosed;
        g.lumen = new bool[n];
        for (int i = 0; i < n; i++) g.lumen[i] = !g.tissue[i] && enclosed[i] == 5;

        // Clearance: chamfer distance to anything that isn't lumen (tissue, openings to the outside) or to the cut
        // plane, so droplets spread around a route can never leave the sealed chambers.
        var dist = new float[n];
        for (int i = 0; i < n; i++) dist[i] = g.lumen[i] ? (g.zCut - g.Pos(i).z) / Cell : 0f;
        Chamfer(g, dist, true);
        Chamfer(g, dist, false);
        g.clear = new float[n];
        for (int i = 0; i < n; i++) g.clear[i] = Mathf.Max(0f, dist[i] - 0.5f) * Cell;
        return g;
    }

    // Counts, per voxel, whether tissue was met earlier along the walk direction (i.e. lies on the opposite side).
    static void Sweep(Grid g, byte[] enclosed, int dx, int dy, int dz)
    {
        int lenA = dx != 0 ? g.ny : g.nx, lenB = dz != 0 ? g.ny : g.nz, lenW = dx != 0 ? g.nx : dy != 0 ? g.ny : g.nz;
        for (int a = 0; a < lenA; a++)
        for (int b = 0; b < lenB; b++)
        {
            bool seen = false;
            for (int s = 0; s < lenW; s++)
            {
                int w = (dx + dy + dz) > 0 ? s : lenW - 1 - s;
                int x = dx != 0 ? w : a, y = dx != 0 ? a : dy != 0 ? w : b, z = dz != 0 ? w : b;
                int i = (z * g.ny + y) * g.nx + x;
                if (g.tissue[i]) seen = true;
                else if (seen) enclosed[i]++;
            }
        }
    }

    static void Chamfer(Grid g, float[] dist, bool forward)
    {
        int s = forward ? 1 : -1;
        int zs = forward ? 0 : g.nz - 1, ys = forward ? 0 : g.ny - 1, xs = forward ? 0 : g.nx - 1;
        for (int z = zs; z >= 0 && z < g.nz; z += s)
        for (int y = ys; y >= 0 && y < g.ny; y += s)
        for (int x = xs; x >= 0 && x < g.nx; x += s)
        {
            int i = (z * g.ny + y) * g.nx + x;
            if (dist[i] == 0f) continue;
            float best = dist[i];
            for (int dz = -1; dz <= 0; dz++)
            for (int dy = -1; dy <= 1; dy++)
            for (int dx = -1; dx <= 1; dx++)
            {
                if (dz == 0 && (dy > 0 || (dy == 0 && dx >= 0))) continue; // half-mask already visited in this sweep
                int nx = x + dx * s, ny = y + dy * s, nz = z + dz * s;
                if (nx < 0 || ny < 0 || nz < 0 || nx >= g.nx || ny >= g.ny || nz >= g.nz) continue;
                float w = Mathf.Sqrt(dx * dx + dy * dy + dz * dz);
                float cand = dist[(nz * g.ny + ny) * g.nx + nx] + w;
                if (cand < best) best = cand;
            }
            dist[i] = best;
        }
    }

    static float CutPlaneZ(Vector3[] v, int[] tris)
    {
        var area = new Dictionary<int, float>();
        for (int t = 0; t < tris.Length; t += 3)
        {
            Vector3 a = v[tris[t]], c = v[tris[t + 1]], d = v[tris[t + 2]];
            var cr = Vector3.Cross(c - a, d - a);
            float m = cr.magnitude;
            if (m <= 0f || Mathf.Abs(cr.z / m) < 0.97f) continue;
            int k = Mathf.RoundToInt((a.z + c.z + d.z) / 3f * 2000f);
            area.TryGetValue(k, out float s);
            area[k] = s + m * 0.5f;
        }
        int bestK = 0; float bestA = -1f;
        foreach (var kv in area) if (kv.Value > bestA) { bestA = kv.Value; bestK = kv.Key; }
        return bestK / 2000f;
    }

    // Nearest well-cleared lumen voxel to a seed, trading clearance against distance.
    public static int Snap(Grid g, Vector3 seed, bool[] allowed = null)
    {
        int r = Mathf.CeilToInt(SnapRadius / Cell), best = -1;
        float bestScore = float.NegativeInfinity;
        int cx = Mathf.FloorToInt((seed.x - g.min.x) / Cell), cy = Mathf.FloorToInt((seed.y - g.min.y) / Cell), cz = Mathf.FloorToInt((seed.z - g.min.z) / Cell);
        for (int z = cz - r; z <= cz + r; z++)
        for (int y = cy - r; y <= cy + r; y++)
        for (int x = cx - r; x <= cx + r; x++)
        {
            if (x < 0 || y < 0 || z < 0 || x >= g.nx || y >= g.ny || z >= g.nz) continue;
            int i = (z * g.ny + y) * g.nx + x;
            if (!g.lumen[i] || g.clear[i] < MinClear || (allowed != null && !allowed[i])) continue;
            float score = g.clear[i] - Vector3.Distance(g.Pos(i), seed);
            if (score > bestScore) { bestScore = score; best = i; }
        }
        return best;
    }

    // Nearest usable lumen voxel to a seed, by distance alone — for valve orifices, where the bone sits in the
    // leaflet and the opening is the small gap right beside it (Snap would wrongly prefer a wide chamber pocket).
    public static int SnapNearest(Grid g, Vector3 seed, bool[] allowed = null)
    {
        int r = Mathf.CeilToInt(SnapRadius / Cell), best = -1;
        float bestDist = float.PositiveInfinity;
        int cx = Mathf.FloorToInt((seed.x - g.min.x) / Cell), cy = Mathf.FloorToInt((seed.y - g.min.y) / Cell), cz = Mathf.FloorToInt((seed.z - g.min.z) / Cell);
        for (int z = cz - r; z <= cz + r; z++)
        for (int y = cy - r; y <= cy + r; y++)
        for (int x = cx - r; x <= cx + r; x++)
        {
            if (x < 0 || y < 0 || z < 0 || x >= g.nx || y >= g.ny || z >= g.nz) continue;
            int i = (z * g.ny + y) * g.nx + x;
            if (!g.lumen[i] || g.clear[i] < MinClear || (allowed != null && !allowed[i])) continue;
            float d = Vector3.Distance(g.Pos(i), seed);
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return best;
    }

    // A* through lumen voxels with enough clearance; cost rises near walls so routes run down the middle.
    public static List<Vector3> FindPath(Grid g, int start, int goal, bool[] blocked = null, bool[] avoid = null)
    {
        int n = g.lumen.Length;
        var gs = new float[n];
        var parent = new int[n];
        var closed = new bool[n];
        for (int i = 0; i < n; i++) gs[i] = float.PositiveInfinity;
        var heap = new MinHeap();
        Vector3 goalPos = g.Pos(goal);
        gs[start] = 0f;
        parent[start] = -1;
        heap.Push(Vector3.Distance(g.Pos(start), goalPos), start);
        while (heap.Count > 0)
        {
            int cur = heap.Pop();
            if (closed[cur]) continue;
            closed[cur] = true;
            if (cur == goal) break;
            int x = cur % g.nx, y = (cur / g.nx) % g.ny, z = cur / (g.nx * g.ny);
            for (int dz = -1; dz <= 1; dz++)
            for (int dy = -1; dy <= 1; dy++)
            for (int dx = -1; dx <= 1; dx++)
            {
                if (dx == 0 && dy == 0 && dz == 0) continue;
                int nx = x + dx, ny = y + dy, nz = z + dz;
                if (nx < 0 || ny < 0 || nz < 0 || nx >= g.nx || ny >= g.ny || nz >= g.nz) continue;
                int j = (nz * g.ny + ny) * g.nx + nx;
                bool open = g.lumen[j] && g.clear[j] >= MinClear;
                if (closed[j] || !(open || g.tissue[j] || j == goal) || (blocked != null && blocked[j])) continue;
                float step = Mathf.Sqrt(dx * dx + dy * dy + dz * dz) * Cell;
                float wall = 0.004f / Mathf.Max(g.clear[j], 0.0005f);
                float tissue = g.front[j] >= 2 ? TissueCost : TissueCost * 20f; // visible walls are near-forbidden
                float cost = g.tissue[j] ? tissue : avoid != null && avoid[j] ? AvoidCost : 1f + 3f * wall * wall;
                float cand = gs[cur] + step * cost;
                if (cand >= gs[j]) continue;
                gs[j] = cand;
                parent[j] = cur;
                heap.Push(cand + Vector3.Distance(g.Pos(j), goalPos), j);
            }
        }
        if (!closed[goal]) return null;
        var path = new List<Vector3>();
        for (int i = goal; i != -1; i = parent[i]) path.Add(g.Pos(i));
        path.Reverse();
        return path;
    }

    class MinHeap
    {
        readonly List<float> keys = new List<float>();
        readonly List<int> vals = new List<int>();
        public int Count => keys.Count;

        public void Push(float k, int v)
        {
            keys.Add(k); vals.Add(v);
            int i = keys.Count - 1;
            while (i > 0)
            {
                int p = (i - 1) / 2;
                if (keys[p] <= keys[i]) break;
                Swap(i, p); i = p;
            }
        }

        public int Pop()
        {
            int top = vals[0], last = keys.Count - 1;
            Swap(0, last);
            keys.RemoveAt(last); vals.RemoveAt(last);
            int i = 0;
            while (true)
            {
                int l = 2 * i + 1, r = l + 1, m = i;
                if (l < keys.Count && keys[l] < keys[m]) m = l;
                if (r < keys.Count && keys[r] < keys[m]) m = r;
                if (m == i) break;
                Swap(i, m); i = m;
            }
            return top;
        }

        void Swap(int a, int b)
        {
            (keys[a], keys[b]) = (keys[b], keys[a]);
            (vals[a], vals[b]) = (vals[b], vals[a]);
        }
    }

    public static string Plan()
    {
        var sb = new StringBuilder();
        var dia = BuildAt(DiastoleTime, out var root);
        var diaSeeds = new Dictionary<BloodFlowPath, Vector3[]>();
        var flows = Object.FindObjectsByType<BloodFlowPath>(FindObjectsSortMode.None);
        foreach (var f in flows) diaSeeds[f] = SeedPositions(f, root);
        var sys = BuildAt(SystoleTime, out root);
        var sysSeeds = new Dictionary<BloodFlowPath, Vector3[]>();
        foreach (var f in flows) sysSeeds[f] = SeedPositions(f, root);
        root.GetComponent<Animation>().clip.SampleAnimation(root.gameObject, 0f);

        // Each circuit's own chambers (flooded from its atrium and ventricle); a route may not borrow the other
        // circuit's chambers, e.g. oxygenated blood must not reach the aorta via the pulmonary trunk.
        var ownDia = new Dictionary<BloodFlowPath, bool[]>();
        var ownSys = new Dictionary<BloodFlowPath, bool[]>();
        foreach (var f in flows)
        {
            ownDia[f] = Flood(dia, Snap(dia, diaSeeds[f][1]), Snap(dia, diaSeeds[f][3]));
            ownSys[f] = Flood(sys, Snap(sys, sysSeeds[f][1]), Snap(sys, sysSeeds[f][3]));
        }

        foreach (var f in flows)
        {
            var blockDia = new bool[dia.lumen.Length];
            var blockSys = new bool[sys.lumen.Length];
            foreach (var o in flows)
            {
                if (o == f) continue;
                for (int i = 0; i < blockDia.Length; i++) blockDia[i] |= ownDia[o][i] && !ownDia[f][i];
                for (int i = 0; i < blockSys.Length; i++) blockSys[i] |= ownSys[o][i] && !ownSys[f][i];
            }

            // nodes: 0 vein end, 1 atrium, 2 AV valve, 3 ventricle, 4 semilunar valve, 5 artery end.
            // Vein/artery ends are placed deliberately (hidden inside a vessel or wall) so they aren't snapped.
            // Both valves are REQUIRED waypoints: the valve bones sit in the leaflet tissue with a narrow orifice gap
            // beside them, so blood is forced through that orifice (SnapNearest) rather than any incidental mesh hole.
            // Optional nodes 6 (vessel rim) and 7 (outside) add a visible outlet.
            var s0 = diaSeeds[f];
            var s1 = sysSeeds[f];

            var route = new List<Vector3>();
            var legEnd = new int[5];
            bool ok = true;
            void Leg(int k, Grid grid, int a, int b, bool[] blocked, bool[] avoid = null)
            {
                if (!ok) return;
                if (a < 0 || b < 0) { sb.AppendLine($"{f.name}: leg {k} has a seed with no usable space nearby"); ok = false; return; }
                var leg = FindPath(grid, a, b, blocked, avoid);
                if (leg == null) { sb.AppendLine($"{f.name}: no route for leg {k}"); ok = false; return; }
                if (route.Count > 0 && route[route.Count - 1] == leg[0]) leg.RemoveAt(0);
                route.AddRange(leg);
                legEnd[k] = route.Count - 1;
            }

            int avOpen = SnapNearest(dia, s0[2]);                                   // AV orifice, valve open (diastole)
            Leg(0, dia, dia.IndexOf(s0[0]), Snap(dia, s0[1]), blockDia);           // vein -> atrium
            Leg(1, dia, Snap(dia, s0[1]), avOpen, blockDia);                       // atrium -> AV valve orifice
            Leg(2, dia, avOpen, Snap(dia, s0[3]), blockDia);                       // AV valve -> ventricle
            if (!ok) continue;

            // Ejection: the AV valve is shut, so blood must leave through the semilunar valve. Seal around the AV
            // orifice the inflow actually used (and the bone) so the outflow can't slip back through it.
            var ejectBlock = (bool[])blockSys.Clone();
            BlockSphere(sys, ejectBlock, route[legEnd[1]], AvSealRadius);
            BlockSphere(sys, ejectBlock, s1[2], AvSealRadius);
            int ventSys = Snap(sys, s1[3]);
            int valve = SnapNearest(sys, s1[4], Flood(sys, ejectBlock, ventSys));  // semilunar orifice, reachable with AV shut

            // Past the valve, a vessel that runs out of sight (the aorta, behind the pulmonary trunk here) must not
            // wander back through visible chambers: visible space costs more than a hidden seam.
            bool[] avoid = null;
            if (f.hiddenOutflow && valve >= 0)
            {
                avoid = new bool[sys.lumen.Length];
                var valvePos = sys.Pos(valve);
                for (int i = 0; i < avoid.Length; i++)
                    avoid[i] = sys.lumen[i] && sys.front[i] < 2 && Vector3.Distance(sys.Pos(i), valvePos) > ValveExitRadius;
            }

            Leg(3, sys, ventSys, valve, ejectBlock);                               // ventricle -> semilunar valve
            Leg(4, sys, valve, sys.IndexOf(s1[5]), ejectBlock, avoid);             // valve -> artery
            if (!ok) continue;
            int atriumAt = legEnd[0], avAt = legEnd[1], ventricleAt = legEnd[2], valveAt = legEnd[3];

            Smooth(route, new HashSet<int> { 0, atriumAt, avAt, ventricleAt, valveAt, route.Count - 1 }, dia, sys, ventricleAt);

            // Optional outlet: straight up the open-ended vessel (node 6 = its rim) and out into the air (node 7),
            // where droplets fade — blood visibly leaving the heart rather than vanishing inside it.
            int bodyEnd = route.Count - 1, exitAt = -1;
            if (f.nodes.Length >= 8)
            {
                AppendLine(route, s1[6]);
                exitAt = route.Count - 1;
                AppendLine(route, s1[7]);
            }

            var clearance = new float[route.Count];
            for (int i = 0; i <= bodyEnd; i++)
            {
                var own = i <= ventricleAt ? dia : sys;
                float a = dia.ClearAt(route[i]), b = sys.ClearAt(route[i]);
                clearance[i] = a > 0f && b > 0f ? Mathf.Min(a, b) : own.ClearAt(route[i]);
            }

            // Seam = inside tissue; padded 2 points (~2mm) so droplets only show once clear of the wall surface.
            var seam = new bool[route.Count];
            for (int i = 0; i < route.Count; i++)
            {
                var grid = i <= ventricleAt ? dia : sys;
                int vi = grid.IndexOf(route[i]);
                if (vi < 0 || !grid.tissue[vi]) continue;
                for (int k = Mathf.Max(0, i - 2); k <= Mathf.Min(route.Count - 1, i + 2); k++) seam[k] = true;
            }

            Undo.RecordObject(f, "Plan blood path");
            f.bakedPath = route.ToArray();
            f.bakedClearance = clearance;
            f.bakedSeam = seam;
            f.atriumPoint = atriumAt;
            f.avValvePoint = avAt;
            f.ventriclePoint = ventricleAt;
            f.valvePoint = valveAt;
            f.exitPoint = exitAt;
            EditorUtility.SetDirty(f);
            var anchorAt = new[] { 0, atriumAt, avAt, ventricleAt, valveAt, bodyEnd, exitAt };

            float len = 0f;
            int inTissue = 0, visible = 0, backflow = 0, shownAfterValve = 0; // backflow = outflow inside the closed AV valve
            for (int i = 1; i < route.Count; i++) len += Vector3.Distance(route[i - 1], route[i]);
            for (int i = 0; i <= bodyEnd; i++)
            {
                var grid = i <= ventricleAt ? dia : sys;
                int vi = grid.IndexOf(route[i]);
                if (i > ventricleAt && vi >= 0 && ejectBlock[vi]) backflow++;
                if (i > valveAt && vi >= 0 && avoid != null && avoid[vi]) shownAfterValve++;
                if (vi < 0 || !grid.tissue[vi]) continue;
                inTissue++;
                if (TissueInFront(grid, vi) < 2) visible++;
            }
            float valveMiss = Vector3.Distance(route[valveAt], s1[4]);
            sb.AppendLine($"{f.name}: {route.Count} pts, {len * 1000f:0}mm, through tissue {inTissue} pts ({visible} visible), " +
                          $"outflow in the closed AV valve {backflow}, visible points past the valve {shownAfterValve}{(avoid == null ? " (not checked)" : "")}, valve point {valveMiss * 1000f:0.0}mm from valve bone, anchors {string.Join(",", anchorAt)}");
        }
        UnityEditor.SceneManagement.EditorSceneManager.MarkSceneDirty(root.gameObject.scene);
        return sb.ToString();
    }

    static void AppendLine(List<Vector3> route, Vector3 to)
    {
        var from = route[route.Count - 1];
        int steps = Mathf.Max(1, Mathf.CeilToInt(Vector3.Distance(from, to) / Cell));
        for (int k = 1; k <= steps; k++) route.Add(Vector3.Lerp(from, to, (float)k / steps));
    }

    static bool[] Flood(Grid g, params int[] seeds) => Flood(g, null, seeds);

    static bool[] Flood(Grid g, bool[] blocked, params int[] seeds)
    {
        var r = new bool[g.lumen.Length];
        var q = new Queue<int>();
        foreach (var s in seeds) if (s >= 0 && !r[s]) { r[s] = true; q.Enqueue(s); }
        while (q.Count > 0)
        {
            int i = q.Dequeue();
            int x = i % g.nx, y = (i / g.nx) % g.ny, z = i / (g.nx * g.ny);
            for (int k = 0; k < 6; k++)
            {
                int nx = x + (k == 0 ? 1 : k == 1 ? -1 : 0), ny = y + (k == 2 ? 1 : k == 3 ? -1 : 0), nz = z + (k == 4 ? 1 : k == 5 ? -1 : 0);
                if (nx < 0 || ny < 0 || nz < 0 || nx >= g.nx || ny >= g.ny || nz >= g.nz) continue;
                int j = (nz * g.ny + ny) * g.nx + nx;
                if (r[j] || !g.lumen[j] || g.clear[j] < MinClear || (blocked != null && blocked[j])) continue;
                r[j] = true;
                q.Enqueue(j);
            }
        }
        return r;
    }

    static void BlockSphere(Grid g, bool[] blocked, Vector3 centre, float radius)
    {
        int r = Mathf.CeilToInt(radius / Cell);
        int cx = Mathf.FloorToInt((centre.x - g.min.x) / Cell), cy = Mathf.FloorToInt((centre.y - g.min.y) / Cell), cz = Mathf.FloorToInt((centre.z - g.min.z) / Cell);
        for (int z = cz - r; z <= cz + r; z++)
        for (int y = cy - r; y <= cy + r; y++)
        for (int x = cx - r; x <= cx + r; x++)
        {
            if (x < 0 || y < 0 || z < 0 || x >= g.nx || y >= g.ny || z >= g.nz) continue;
            int i = (z * g.ny + y) * g.nx + x;
            if (Vector3.Distance(g.Pos(i), centre) <= radius) blocked[i] = true;
        }
    }

    static int Closest(List<Vector3> route, Vector3 p, int from, int to)
    {
        int best = from;
        for (int i = from; i <= to; i++)
            if ((route[i] - p).sqrMagnitude < (route[best] - p).sqrMagnitude) best = i;
        return best;
    }

    // Tissue voxels between this voxel and the viewer (the cut face); >= 2 means it can't be seen from the front.
    public static int TissueInFront(Grid g, int i) => g.front[i];

    static Vector3[] SeedPositions(BloodFlowPath f, Transform root)
    {
        var p = new Vector3[f.nodes.Length];
        for (int k = 0; k < p.Length; k++)
        {
            var bone = FindDeep(root, f.nodes[k].bone);
            p[k] = root.InverseTransformPoint(bone.position) + f.nodes[k].offset;
        }
        return p;
    }

    // Laplacian smoothing of the voxel staircase; a move is kept only if the point stays in well-cleared lumen.
    static void Smooth(List<Vector3> route, HashSet<int> fixedIdx, Grid dia, Grid sys, int switchAt)
    {
        for (int iter = 0; iter < 30; iter++)
        for (int i = 1; i < route.Count - 1; i++)
        {
            if (fixedIdx.Contains(i)) continue;
            var cand = Vector3.Lerp(route[i], (route[i - 1] + route[i + 1]) * 0.5f, 0.6f);
            var grid = i <= switchAt ? dia : sys;
            if (grid.ClearAt(cand) >= MinClear * 0.8f) route[i] = cand;
        }
    }

    static Transform FindDeep(Transform parent, string targetName)
    {
        foreach (Transform child in parent)
        {
            if (child.name == targetName) return child;
            var found = FindDeep(child, targetName);
            if (found != null) return found;
        }
        return null;
    }

    // Lumen regions with route-sized clearance, for choosing seeds.
    public static string Report(float time)
    {
        var g = BuildAt(time, out var root);
        root.GetComponent<Animation>().clip.SampleAnimation(root.gameObject, 0f);
        var sb = new StringBuilder();
        int tissue = 0, lumen = 0;
        for (int i = 0; i < g.lumen.Length; i++) { if (g.tissue[i]) tissue++; if (g.lumen[i]) lumen++; }
        sb.AppendLine($"t={time} grid {g.nx}x{g.ny}x{g.nz} zCut={g.zCut:F4} tissue={tissue} lumen={lumen}");
        var seen = new bool[g.lumen.Length];
        var q = new Queue<int>();
        for (int s = 0; s < g.lumen.Length; s++)
        {
            if (seen[s] || !g.lumen[s] || g.clear[s] < MinClear) continue;
            int count = 0, bestI = s;
            var bb = new Bounds(g.Pos(s), Vector3.zero);
            seen[s] = true; q.Enqueue(s);
            while (q.Count > 0)
            {
                int i = q.Dequeue(); count++;
                var p = g.Pos(i); bb.Encapsulate(p);
                if (g.clear[i] > g.clear[bestI]) bestI = i;
                int x = i % g.nx, y = (i / g.nx) % g.ny, z = i / (g.nx * g.ny);
                foreach (var d in new[] { (1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1) })
                {
                    int nx = x + d.Item1, ny = y + d.Item2, nz = z + d.Item3;
                    if (nx < 0 || ny < 0 || nz < 0 || nx >= g.nx || ny >= g.ny || nz >= g.nz) continue;
                    int j = (nz * g.ny + ny) * g.nx + nx;
                    if (seen[j] || !g.lumen[j] || g.clear[j] < MinClear) continue;
                    seen[j] = true; q.Enqueue(j);
                }
            }
            if (count < 30) continue;
            sb.AppendLine($"region {count} vox, min {(bb.min * 1000f):F0} max {(bb.max * 1000f):F0} (mm, root), widest at {(g.Pos(bestI) * 1000f):F0} clear {g.clear[bestI] * 1000f:0.0}mm");
        }
        return sb.ToString();
    }
}
