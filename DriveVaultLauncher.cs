using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace DriveVault
{
    static class Program
    {
        private const string AppUrl = "http://127.0.0.1:3000";

        [STAThread]
        static void Main()
        {
            try
            {
                try { Process.GetCurrentProcess().PriorityClass = ProcessPriorityClass.BelowNormal; } catch { }

                string projectDir = FindProjectRoot(AppDomain.CurrentDomain.BaseDirectory);
                if (string.IsNullOrEmpty(projectDir))
                {
                    projectDir = FindProjectRoot(Directory.GetCurrentDirectory());
                }
                if (string.IsNullOrEmpty(projectDir))
                {
                    projectDir = AppDomain.CurrentDomain.BaseDirectory;
                }

                // 1. Ensure backend Next.js server is running
                if (!CheckServerRunning("http://127.0.0.1:3000") && !CheckServerRunning("http://127.0.0.1:39821"))
                {
                    StartBackendServer(projectDir);
                    for (int i = 0; i < 40; i++)
                    {
                        Thread.Sleep(250);
                        if (CheckServerRunning("http://127.0.0.1:3000") || CheckServerRunning("http://127.0.0.1:39821")) break;
                    }
                }

                // 2. Launch Native Electron Window
                LaunchElectronApp(projectDir);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Could not launch DriveVault: " + ex.Message, "DriveVault Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static bool CheckServerRunning(string url = AppUrl)
        {
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(url + "/api/health");
                req.Timeout = 800;
                req.Method = "GET";
                using (var res = (HttpWebResponse)req.GetResponse())
                {
                    return res.StatusCode == HttpStatusCode.OK;
                }
            }
            catch
            {
                return false;
            }
        }

        static void StartBackendServer(string projectDir)
        {
            try
            {
                string nextBin = Path.Combine(projectDir, @"node_modules\next\dist\bin\next");
                ProcessStartInfo startInfo;

                if (File.Exists(nextBin))
                {
                    startInfo = new ProcessStartInfo
                    {
                        FileName = "node",
                        Arguments = string.Format("\"{0}\" start -p 3000 -H 127.0.0.1", nextBin),
                        WorkingDirectory = projectDir,
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };
                }
                else
                {
                    startInfo = new ProcessStartInfo
                    {
                        FileName = "cmd.exe",
                        Arguments = "/c npm start",
                        WorkingDirectory = projectDir,
                        CreateNoWindow = true,
                        UseShellExecute = false,
                        WindowStyle = ProcessWindowStyle.Hidden
                    };
                }

                startInfo.EnvironmentVariables["NODE_ENV"] = "production";
                var proc = Process.Start(startInfo);
                if (proc != null)
                {
                    try { proc.PriorityClass = ProcessPriorityClass.BelowNormal; } catch { }
                }
            }
            catch { }
        }

        static void LaunchElectronApp(string projectDir)
        {
            string electronDist = Path.Combine(projectDir, @"dist-installer\win-unpacked\DriveVault.exe");
            string electronBin = Path.Combine(projectDir, @"node_modules\electron\dist\electron.exe");

            if (File.Exists(electronDist))
            {
                var psi = new ProcessStartInfo
                {
                    FileName = electronDist,
                    WorkingDirectory = Path.Combine(projectDir, @"dist-installer\win-unpacked"),
                    UseShellExecute = false
                };
                Process.Start(psi);
            }
            else if (File.Exists(electronBin))
            {
                var psi = new ProcessStartInfo
                {
                    FileName = electronBin,
                    Arguments = string.Format("\"{0}\"", projectDir),
                    WorkingDirectory = projectDir,
                    UseShellExecute = false
                };
                Process.Start(psi);
            }
            else
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "cmd.exe",
                    Arguments = "/c npx electron .",
                    WorkingDirectory = projectDir,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                Process.Start(psi);
            }
        }

        static string FindProjectRoot(string startDir)
        {
            if (string.IsNullOrEmpty(startDir)) return null;
            try
            {
                var dir = new DirectoryInfo(startDir);
                while (dir != null && dir.Exists)
                {
                    if (File.Exists(Path.Combine(dir.FullName, "package.json")))
                    {
                        return dir.FullName;
                    }
                    dir = dir.Parent;
                }
            }
            catch { }
            return null;
        }
    }
}
