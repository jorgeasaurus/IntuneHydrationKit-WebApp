"use client";

import { useState, useEffect } from "react";
import { useMsal } from "@azure/msal-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CloudEnvironment } from "@/types/hydration";
import { useWizardState } from "@/hooks/useWizardState";
import { InfoIcon, Loader2 } from "lucide-react";
import { createGraphClient } from "@/lib/graph/client";

export function TenantConfig() {
  const { state, setTenantConfig, nextStep } = useWizardState();
  const { accounts } = useMsal();
  const [tenantId, setTenantId] = useState(state.tenantConfig?.tenantId || "");
  const [tenantName, setTenantName] = useState(state.tenantConfig?.tenantName || "");
  const [cloudEnvironment, setCloudEnvironment] = useState<CloudEnvironment>(
    state.tenantConfig?.cloudEnvironment || "global"
  );
  const [isLoadingTenantName, setIsLoadingTenantName] = useState(false);

  // Auto-populate tenant info from signed-in account
  useEffect(() => {
    async function fetchTenantInfo() {
      if (accounts.length > 0 && !state.tenantConfig) {
        const account = accounts[0];

        // Get tenant ID from the account
        if (account.tenantId) {
          setTenantId(account.tenantId);
        }

        // Fetch the actual organization display name from Graph API
        try {
          setIsLoadingTenantName(true);
          const graphClient = createGraphClient(cloudEnvironment);

          interface Organization {
            displayName: string;
            id: string;
          }

          // The /organization endpoint returns a collection
          const orgs = await graphClient.getCollection<Organization>("/organization", "v1.0");

          if (orgs && orgs.length > 0 && orgs[0].displayName) {
            setTenantName(orgs[0].displayName);
          }
        } catch (error) {
          console.error("Failed to fetch organization name:", error);

          // Fallback: extract from username domain
          if (account.username) {
            const domain = account.username.split("@")[1];
            if (domain) {
              const name = domain.replace(".onmicrosoft.com", "").split(".")[0];
              const displayName = name.charAt(0).toUpperCase() + name.slice(1);
              setTenantName(displayName);
            }
          }
        } finally {
          setIsLoadingTenantName(false);
        }
      }
    }

    fetchTenantInfo();
  }, [accounts, state.tenantConfig, cloudEnvironment]);

  const handleContinue = () => {
    setTenantConfig({
      tenantId,
      tenantName: tenantName || undefined,
      cloudEnvironment,
    });
    nextStep();
  };

  const isValid = tenantId.length > 0;

  const isAutoPopulated = accounts.length > 0 && accounts[0].tenantId === tenantId;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tenant Configuration</CardTitle>
        <CardDescription>
          Configure your Microsoft Intune tenant connection settings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAutoPopulated && (
          <Alert>
            <InfoIcon className="h-4 w-4" />
            <AlertDescription>
              Tenant information has been auto-populated from your signed-in account. You can
              modify it if you want to manage a different tenant.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="tenantId">Tenant ID (Required)</Label>
          <Input
            id="tenantId"
            placeholder="00000000-0000-0000-0000-000000000000"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            {isAutoPopulated
              ? "Auto-populated from your signed-in account"
              : "Your Azure AD Tenant ID (GUID format)"}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="tenantName">Tenant Display Name (Optional)</Label>
          <div className="relative">
            <Input
              id="tenantName"
              placeholder="Contoso"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              disabled={isLoadingTenantName}
            />
            {isLoadingTenantName && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {isLoadingTenantName
              ? "Fetching organization name from Microsoft Graph..."
              : "A friendly name for your tenant (for display purposes)"}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="cloudEnvironment">Cloud Environment</Label>
          <Select
            value={cloudEnvironment}
            onValueChange={(value) => setCloudEnvironment(value as CloudEnvironment)}
          >
            <SelectTrigger id="cloudEnvironment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Global (Commercial)</SelectItem>
              <SelectItem value="usgov">US Government (GCC High)</SelectItem>
              <SelectItem value="usgovdod">US Government (DoD)</SelectItem>
              <SelectItem value="germany">Germany</SelectItem>
              <SelectItem value="china">China (21Vianet)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="pt-4">
          <Button onClick={handleContinue} disabled={!isValid} className="w-full">
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
