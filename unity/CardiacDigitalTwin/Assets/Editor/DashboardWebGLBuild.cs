using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

// Tools > Cardiac Twin > Build WebGL for dashboard: builds the heart scene for the browser into the web app's
// public/unity/ folder (served by Vite, committed to git), Gzip-compressed with the decompression fallback so it
// works on any static server. Writes public/unity/build.json, which the dashboard (src/congestion/unityHeart.js)
// reads to find the build files.
public static class DashboardWebGLBuild
{
    const string Scene = "Assets/Scenes/SampleScene.unity";

    [MenuItem("Tools/Cardiac Twin/Build WebGL for dashboard")]
    public static void Build()
    {
        string outDir = Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", "..", "public", "unity"));
        if (Directory.Exists(outDir)) FileUtil.DeleteFileOrDirectory(outDir);   // no stale files from older builds

        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Gzip;
        PlayerSettings.WebGL.decompressionFallback = true;

        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
        {
            scenes = new[] { Scene },
            locationPathName = outDir,
            target = BuildTarget.WebGL,
            options = BuildOptions.None,
        });
        if (report.summary.result != BuildResult.Succeeded)
        {
            EditorUtility.DisplayDialog("Cardiac Twin", $"WebGL build {report.summary.result}. See the Console.", "OK");
            return;
        }

        string buildDir = Path.Combine(outDir, "Build");
        string Find(string marker)
        {
            var hit = Directory.GetFiles(buildDir).Select(Path.GetFileName).FirstOrDefault(f => f.Contains(marker));
            if (hit == null) throw new FileNotFoundException($"no *{marker}* file in {buildDir}");
            return "Build/" + hit;
        }
        string json = "{\n" +
            $"  \"loaderUrl\": \"{Find(".loader.js")}\",\n" +
            $"  \"dataUrl\": \"{Find(".data")}\",\n" +
            $"  \"frameworkUrl\": \"{Find(".framework.js")}\",\n" +
            $"  \"codeUrl\": \"{Find(".wasm")}\",\n" +
            $"  \"version\": \"{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}\"\n}}\n";
        File.WriteAllText(Path.Combine(outDir, "build.json"), json);

        long bytes = Directory.GetFiles(outDir, "*", SearchOption.AllDirectories).Sum(f => new FileInfo(f).Length);
        Debug.Log($"Cardiac Twin: WebGL build ready in {outDir} ({bytes / 1048576f:0.0} MB). Reload the dashboard.");
        EditorUtility.DisplayDialog("Cardiac Twin", $"WebGL build ready ({bytes / 1048576f:0.0} MB).\nReload the dashboard.", "OK");
    }
}
