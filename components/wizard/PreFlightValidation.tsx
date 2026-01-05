"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useWizardState } from "@/hooks/useWizardState";
import { createGraphClient } from "@/lib/graph/client";
import { validateTenant, ValidationResult } from "@/lib/hydration/validator";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  WifiOff,
  Shield,
  Key,
  UserCheck,
} from "lucide-react";

export function PreFlightValidation() {
  const { state, nextStep, previousStep } = useWizardState();
  const [isValidating, setIsValidating] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Auto-start validation when component mounts
    handleValidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleValidate = async () => {
    if (!state.tenantConfig) return;

    setIsValidating(true);
    setProgress(0);

    try {
      const client = createGraphClient(state.tenantConfig.cloudEnvironment);

      // Simulate progress for better UX
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const result = await validateTenant(client);

      clearInterval(progressInterval);
      setProgress(100);
      setValidation(result);
    } catch (error) {
      console.error("Validation failed:", error);
      setValidation({
        isValid: false,
        checks: {
          connectivity: {
            passed: false,
            message: error instanceof Error ? error.message : "Unknown error",
          },
          licenses: {
            passed: false,
            message: "Could not check licenses",
            details: {
              hasIntuneLicense: false,
              hasWindowsE3OrHigher: false,
              assignedLicenses: [],
              validationTime: new Date(),
            },
          },
          permissions: {
            passed: false,
            message: "Could not check permissions",
          },
          role: {
            passed: false,
            message: "Could not check user role",
          },
        },
        errors: ["Failed to validate tenant"],
        warnings: [],
      });
    } finally {
      setIsValidating(false);
    }
  };

  const getIconForCheck = (passed: boolean) => {
    if (isValidating) {
      return <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400" />;
    }
    return passed ? (
      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
    ) : (
      <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
    );
  };

  const checks = [
    {
      icon: WifiOff,
      title: "Connectivity",
      result: validation?.checks.connectivity,
    },
    {
      icon: Shield,
      title: "Licenses",
      result: validation?.checks.licenses,
    },
    {
      icon: Key,
      title: "Permissions",
      result: validation?.checks.permissions,
    },
    {
      icon: UserCheck,
      title: "User Role",
      result: validation?.checks.role,
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pre-Flight Validation</CardTitle>
        <CardDescription>
          Validating tenant health and permissions before proceeding
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isValidating && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Validating tenant...</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </div>
        )}

        {/* Validation Checks */}
        <div className="space-y-3">
          {checks.map((check, index) => (
            <div
              key={index}
              className="flex items-start gap-3 rounded-lg border p-4"
            >
              <check.icon className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{check.title}</p>
                  {check.result && getIconForCheck(check.result.passed)}
                </div>
                {check.result && (
                  <p className="text-sm text-muted-foreground">{check.result.message}</p>
                )}
                {check.result && "missingPermissions" in check.result &&
                  Array.isArray(check.result.missingPermissions) &&
                  check.result.missingPermissions.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground">Missing permissions:</p>
                      <ul className="text-xs text-muted-foreground list-disc list-inside mt-1">
                        {check.result.missingPermissions.map((perm: string) => (
                          <li key={perm}>{perm}</li>
                        ))}
                      </ul>
                    </div>
                  )}
              </div>
            </div>
          ))}
        </div>

        {/* Warnings */}
        {validation && validation.warnings.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Warnings</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside space-y-1">
                {validation.warnings.map((warning, index) => (
                  <li key={index} className="text-sm">
                    {warning}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Errors */}
        {validation && validation.errors.length > 0 && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Validation Failed</AlertTitle>
            <AlertDescription>
              <ul className="list-disc list-inside space-y-1">
                {validation.errors.map((error, index) => (
                  <li key={index} className="text-sm">
                    {error}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        {/* Actions */}
        <div className="flex gap-4">
          <Button variant="outline" onClick={previousStep} className="flex-1">
            Back
          </Button>
          {validation && !validation.isValid ? (
            <Button
              variant="outline"
              onClick={handleValidate}
              disabled={isValidating}
              className="flex-1"
            >
              {isValidating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                "Retry Validation"
              )}
            </Button>
          ) : (
            <Button
              onClick={nextStep}
              disabled={!validation || !validation.isValid || isValidating}
              className="flex-1"
            >
              Continue
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
