"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useWizardState } from "@/hooks/useWizardState";
import { Download, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";

export function BaselineConfig() {
  const { state, setBaselineConfig, nextStep, previousStep } = useWizardState();
  const [repoUrl, setRepoUrl] = useState(
    state.baselineConfig?.repoUrl || "https://github.com/jorgeasaurus/OpenIntuneBaseline"
  );
  const [branch, setBranch] = useState(state.baselineConfig?.branch || "main");
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "success" | "error">("idle");
  const [version, setVersion] = useState(state.baselineConfig?.version || "");
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadStatus("idle");
    setError(null);

    try {
      // Extract owner and repo from GitHub URL
      const urlParts = repoUrl.replace("https://github.com/", "").split("/");
      if (urlParts.length < 2) {
        throw new Error("Invalid GitHub repository URL");
      }
      const [owner, repo] = urlParts;

      // Fetch latest commit SHA from the branch
      const commitsResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`,
        {
          headers: {
            Accept: "application/vnd.github.v3+json",
          },
        }
      );

      if (!commitsResponse.ok) {
        throw new Error(`Failed to fetch repository info: ${commitsResponse.statusText}`);
      }

      const commitData = await commitsResponse.json();
      const commitSha = commitData.sha.substring(0, 7); // Short SHA
      const commitDate = new Date(commitData.commit.committer.date).toLocaleDateString();

      // Fetch repository info for additional details
      const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: {
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!repoResponse.ok) {
        throw new Error(`Failed to fetch repository details: ${repoResponse.statusText}`);
      }

      const repoData = await repoResponse.json();
      const versionString = `${branch}@${commitSha} (${commitDate})`;

      // Store baseline configuration
      setVersion(versionString);
      setDownloadStatus("success");

      // Cache the configuration
      setBaselineConfig({
        repoUrl,
        branch,
        version: versionString,
      });

      console.log("OpenIntuneBaseline baseline downloaded:", {
        owner,
        repo,
        branch,
        commit: commitSha,
        date: commitDate,
        description: repoData.description,
      });
    } catch (err) {
      console.error("Failed to download baseline:", err);
      setError(err instanceof Error ? err.message : "Failed to download baseline");
      setDownloadStatus("error");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleContinue = () => {
    setBaselineConfig({ repoUrl, branch, version });
    nextStep();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>OpenIntuneBaseline Configuration</CardTitle>
        <CardDescription>
          Configure the OpenIntuneBaseline repository to use for policies
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="repoUrl">GitHub Repository URL</Label>
          <Input
            id="repoUrl"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            The GitHub repository containing OpenIntuneBaseline policies
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="branch">Branch</Label>
          <Input id="branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
          <p className="text-sm text-muted-foreground">
            The branch to download policies from (usually &quot;main&quot;)
          </p>
        </div>

        <div className="space-y-2">
          <Button
            onClick={handleDownload}
            disabled={isDownloading || !repoUrl || !branch}
            className="w-full"
            variant="outline"
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Download Latest Baseline
              </>
            )}
          </Button>
        </div>

        {downloadStatus === "success" && version && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Baseline Downloaded</AlertTitle>
            <AlertDescription>
              Successfully retrieved baseline: <strong>{version}</strong>
            </AlertDescription>
          </Alert>
        )}

        {downloadStatus === "error" && error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Download Failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {downloadStatus === "idle" && (
          <div className="rounded-md bg-muted p-4">
            <p className="text-sm">
              Click &quot;Download Latest Baseline&quot; to fetch the current version from GitHub.
              The baseline policies will be applied during execution.
            </p>
          </div>
        )}

        <div className="flex gap-4">
          <Button variant="outline" onClick={previousStep} className="flex-1">
            Back
          </Button>
          <Button onClick={handleContinue} className="flex-1">
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
