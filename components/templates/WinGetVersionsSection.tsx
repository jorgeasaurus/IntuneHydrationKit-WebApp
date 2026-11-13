import {
  getVersionArchitectures,
  getVersionInstallerTypes,
  type WinGetCatalogApp,
  type WinGetCatalogVersion,
} from "@/lib/winget/versionCatalog";

const LABEL_CLASS =
  "inline-flex rounded-full border px-2.5 py-1 text-[11px] font-mono uppercase tracking-[0.18em]";

function VersionLabel({ version }: { version: WinGetCatalogVersion }) {
  return version.latest ? (
    <span className={`${LABEL_CLASS} border-emerald-300/25 bg-emerald-300/10 text-emerald-100`}>
      Latest
    </span>
  ) : (
    <span className={`${LABEL_CLASS} border-amber-300/25 bg-amber-300/10 text-amber-100`}>
      Best effort
    </span>
  );
}

/** Read-only list of the WinGet versions that the catalog has for one app. */
export function WinGetVersionsSection({ app }: { app: WinGetCatalogApp }) {
  return (
    <section aria-labelledby="template-winget-versions-heading" className="space-y-4">
      <h2 id="template-winget-versions-heading" className="text-xl font-bold text-foreground">
        Available versions
      </h2>
      <div className="space-y-2 text-sm leading-6 text-muted-foreground">
        <p>
          These versions of <span className="font-mono text-xs text-foreground">{app.packageIdentifier}</span>{" "}
          come from the WinGet manifest repository (microsoft/winget-pkgs). A scheduled job
          updates this list. The list shows only versions that have installer URLs that resolve.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="font-semibold text-foreground">Latest</span> is the newest version with
            installers that resolve.
          </li>
          <li>
            <span className="font-semibold text-foreground">Best effort</span> is an older version.
            The vendor can remove or replace the download of an older version at any time. If this
            occurs, the install fails.
          </li>
        </ul>
        <p>
          You cannot select a version yet. At this time, the app installs the latest version. When
          version selection is available, detection will use{" "}
          <span className="font-semibold text-foreground">this version or newer</span>: a device
          that has the selected version or a newer version shows as installed. Thus Intune does not
          report a failure when the app updates itself.
        </p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border/60 bg-black/20">
        <table className="w-full min-w-[560px] text-left text-sm">
          <caption className="sr-only">WinGet versions of {app.displayName}</caption>
          <thead>
            <tr className="border-b border-border/60 text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">Version</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 font-medium">Released</th>
              <th scope="col" className="px-4 py-3 font-medium">Architectures</th>
              <th scope="col" className="px-4 py-3 font-medium">Installer types</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {app.versions.map((version) => (
              <tr key={version.version}>
                <th scope="row" className="px-4 py-3 font-mono text-xs font-semibold text-foreground">
                  {version.version}
                </th>
                <td className="px-4 py-3">
                  <VersionLabel version={version} />
                </td>
                <td className="px-4 py-3 text-muted-foreground">{version.releaseDate ?? "Not stated"}</td>
                <td className="px-4 py-3 font-mono text-xs text-foreground">
                  {getVersionArchitectures(version).join(", ")}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-foreground">
                  {getVersionInstallerTypes(version).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
