"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskCategory, CISCategoryId, OIBPlatformId, CategorySelections } from "@/types/hydration";
import { useWizardState } from "@/hooks/useWizardState";
import { TEMPLATE_METADATA, CIS_CATEGORY_METADATA } from "@/templates";
import {
  fetchOIBManifest,
  fetchDynamicGroups,
  fetchStaticGroups,
  fetchFilters,
  fetchCompliancePolicies,
  fetchConditionalAccessPolicies,
  fetchAppProtectionPolicies,
  fetchEnrollmentProfiles,
  fetchCISBaselineManifest,
  OIBManifest,
  CISBaselineManifest,
  GroupTemplate,
  FilterTemplate,
  ComplianceTemplate,
  ConditionalAccessTemplate,
  AppProtectionTemplate,
} from "@/lib/templates/loader";
import { ChevronDown, ChevronRight, Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Target {
  id: TaskCategory;
  label: string;
  description: string;
  count: number;
  hasSubcategories?: boolean;
}

// Build targets from template metadata
const TARGETS: Target[] = Object.entries(TEMPLATE_METADATA).map(([key, meta]) => ({
  id: key as TaskCategory,
  label: meta.displayName,
  description: meta.description,
  count: meta.count,
  hasSubcategories: "hasSubcategories" in meta ? meta.hasSubcategories : false,
}));

// CIS Categories list
const CIS_CATEGORIES = Object.entries(CIS_CATEGORY_METADATA).map(([id, meta]) => ({
  id: id as CISCategoryId,
  name: meta.name,
  description: meta.description,
  count: meta.count,
}));

// Platform display names for baseline
const PLATFORM_NAMES: Record<OIBPlatformId, string> = {
  WINDOWS: "Windows",
  MACOS: "macOS",
  BYOD: "BYOD (App Protection)",
  WINDOWS365: "Windows 365 Cloud PC",
};

// Generic item type for category items
interface CategoryItem {
  displayName: string;
  description?: string;
  subtype?: string;
}

export function TargetSelection() {
  const { state, setSelectedTargets, setSelectedCISCategories, setBaselineSelection, setCategorySelections, nextStep, previousStep } = useWizardState();
  const [targets, setTargets] = useState<TaskCategory[]>(state.selectedTargets || []);
  const [cisCategories, setCISCategories] = useState<CISCategoryId[]>(state.selectedCISCategories || []);

  // Expanded state for each category
  const [expandedCategories, setExpandedCategories] = useState<Set<TaskCategory>>(new Set());

  // Loading state for each category
  const [loadingCategories, setLoadingCategories] = useState<Set<TaskCategory>>(new Set());

  // Loaded items for each category
  const [categoryItems, setCategoryItems] = useState<Record<string, CategoryItem[]>>({});

  // Selected items for each category (by displayName)
  const [selectedItems, setSelectedItems] = useState<Record<string, Set<string>>>(() => {
    const initial: Record<string, Set<string>> = {};
    if (state.categorySelections) {
      for (const [key, selection] of Object.entries(state.categorySelections)) {
        if (selection && 'selectedItems' in selection) {
          initial[key] = new Set(selection.selectedItems);
        } else if (key === 'baseline' && selection && 'selectedPolicies' in selection) {
          initial[key] = new Set(selection.selectedPolicies);
        }
      }
    }
    return initial;
  });

  // Baseline-specific state
  const [baselineManifest, setBaselineManifest] = useState<OIBManifest | null>(null);
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<OIBPlatformId>>(new Set());

  // CIS Baseline-specific state
  const [cisManifest, setCISManifest] = useState<CISBaselineManifest | null>(null);
  const [cisLoading, setCISLoading] = useState(false);
  const [expandedCISCategories, setExpandedCISCategories] = useState<Set<string>>(new Set());
  const [selectedCISPolicies, setSelectedCISPolicies] = useState<Set<string>>(
    new Set(state.categorySelections?.cisBaseline?.selectedItems || [])
  );

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Load category items when expanded
  const loadCategoryItems = useCallback(async (category: TaskCategory) => {
    if (categoryItems[category] || loadingCategories.has(category)) return;

    setLoadingCategories(prev => new Set(prev).add(category));

    try {
      let items: CategoryItem[] = [];

      switch (category) {
        case "groups": {
          const [dynamic, static_] = await Promise.all([fetchDynamicGroups(), fetchStaticGroups()]);
          items = [...dynamic, ...static_].map(g => ({
            displayName: g.displayName,
            description: g.description,
            subtype: g.membershipRule ? "Dynamic" : "Static",
          }));
          break;
        }
        case "filters": {
          const filters = await fetchFilters();
          items = filters.map(f => ({
            displayName: f.displayName,
            description: f.description,
            subtype: f.platform,
          }));
          break;
        }
        case "compliance": {
          const policies = await fetchCompliancePolicies();
          items = policies.map(p => ({
            displayName: p.displayName,
            description: p.description,
            subtype: p["@odata.type"]?.replace("#microsoft.graph.", "").replace("CompliancePolicy", "") || "",
          }));
          break;
        }
        case "conditionalAccess": {
          const policies = await fetchConditionalAccessPolicies();
          items = policies.map(p => ({
            displayName: p.displayName,
            subtype: "CA Policy",
          }));
          break;
        }
        case "appProtection": {
          const policies = await fetchAppProtectionPolicies();
          items = policies.map(p => ({
            displayName: p.displayName,
            description: p.description,
            subtype: p["@odata.type"]?.includes("ios") ? "iOS" : "Android",
          }));
          break;
        }
        case "enrollment": {
          const profiles = await fetchEnrollmentProfiles();
          items = (profiles as Array<{ displayName?: string; description?: string }>).map(p => ({
            displayName: p.displayName || "Unknown Profile",
            description: p.description,
            subtype: "Autopilot",
          }));
          break;
        }
        case "baseline": {
          const manifest = await fetchOIBManifest();
          setBaselineManifest(manifest);
          if (manifest) {
            items = manifest.files.map(f => ({
              displayName: f.path, // Use path as key for baseline
              description: f.displayName,
              subtype: `${f.platform} - ${f.policyType || "Config"}`,
            }));
          }
          break;
        }
      }

      setCategoryItems(prev => ({ ...prev, [category]: items }));

      // If no items selected yet, select all by default
      if (!selectedItems[category] || selectedItems[category].size === 0) {
        const allNames = items.map(i => i.displayName);
        setSelectedItems(prev => ({ ...prev, [category]: new Set(allNames) }));
      }
    } catch (error) {
      console.error(`Error loading ${category} items:`, error);
    } finally {
      setLoadingCategories(prev => {
        const next = new Set(prev);
        next.delete(category);
        return next;
      });
    }
  }, [categoryItems, loadingCategories, selectedItems]);

  // Load items when category is enabled
  useEffect(() => {
    for (const target of targets) {
      if (target !== "cisBaseline" && !categoryItems[target]) {
        loadCategoryItems(target);
      }
    }
  }, [targets, categoryItems, loadCategoryItems]);

  // Load CIS manifest when cisBaseline is selected
  useEffect(() => {
    if (targets.includes("cisBaseline") && !cisManifest && !cisLoading) {
      setCISLoading(true);
      fetchCISBaselineManifest().then(manifest => {
        setCISManifest(manifest);
        setCISLoading(false);
        // If no policies selected yet, select all by default
        if (manifest && selectedCISPolicies.size === 0) {
          const allPaths = manifest.files.map(f => f.path);
          setSelectedCISPolicies(new Set(allPaths));
        }
      });
    }
  }, [targets, cisManifest, cisLoading, selectedCISPolicies.size]);

  const toggleCategoryExpanded = (category: TaskCategory) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleToggle = (targetId: TaskCategory) => {
    setTargets(prev => {
      const newTargets = prev.includes(targetId)
        ? prev.filter(id => id !== targetId)
        : [...prev, targetId];

      // If disabling, clear selections and collapse
      if (prev.includes(targetId)) {
        setSelectedItems(items => {
          const next = { ...items };
          delete next[targetId];
          return next;
        });
        setExpandedCategories(exp => {
          const next = new Set(exp);
          next.delete(targetId);
          return next;
        });

        // Special handling for CIS
        if (targetId === "cisBaseline") {
          setCISCategories([]);
          setSelectedCISPolicies(new Set());
          setExpandedCISCategories(new Set());
        }
      } else {
        // If enabling, expand and select all (loading happens via useEffect)
        setExpandedCategories(exp => new Set(exp).add(targetId));

        // Special handling for CIS - manifest loading and selection happens via useEffect
        if (targetId === "cisBaseline") {
          setCISCategories(CIS_CATEGORIES.map(c => c.id));
        }
      }

      return newTargets;
    });
  };

  const toggleItem = (category: TaskCategory, itemName: string) => {
    setSelectedItems(prev => {
      const current = prev[category] || new Set();
      const next = new Set(current);
      if (next.has(itemName)) {
        next.delete(itemName);
      } else {
        next.add(itemName);
      }
      return { ...prev, [category]: next };
    });
  };

  const selectAllInCategory = (category: TaskCategory) => {
    const items = categoryItems[category];
    if (!items) return;
    const search = searchQuery.toLowerCase().trim();

    if (search) {
      // When searching, only select matching items (add to existing selection)
      const matchingItems = items.filter(item =>
        item.displayName.toLowerCase().includes(search) ||
        item.description?.toLowerCase().includes(search) ||
        item.subtype?.toLowerCase().includes(search)
      );
      setSelectedItems(prev => {
        const current = prev[category] || new Set();
        return {
          ...prev,
          [category]: new Set([...current, ...matchingItems.map(i => i.displayName)]),
        };
      });
    } else {
      // No search - select all
      setSelectedItems(prev => ({
        ...prev,
        [category]: new Set(items.map(i => i.displayName)),
      }));
    }
  };

  const deselectAllInCategory = (category: TaskCategory) => {
    const items = categoryItems[category];
    const search = searchQuery.toLowerCase().trim();

    if (search && items) {
      // When searching, only deselect matching items (keep non-matching selection)
      const matchingNames = items.filter(item =>
        item.displayName.toLowerCase().includes(search) ||
        item.description?.toLowerCase().includes(search) ||
        item.subtype?.toLowerCase().includes(search)
      ).map(i => i.displayName);

      setSelectedItems(prev => {
        const current = prev[category] || new Set();
        return {
          ...prev,
          [category]: new Set([...current].filter(name => !matchingNames.includes(name))),
        };
      });
    } else {
      // No search - deselect all
      setSelectedItems(prev => ({
        ...prev,
        [category]: new Set(),
      }));
    }
  };

  // CIS category handlers
  const toggleCISCategoryExpanded = (categoryFolder: string) => {
    setExpandedCISCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryFolder)) {
        next.delete(categoryFolder);
      } else {
        next.add(categoryFolder);
      }
      return next;
    });
  };

  const toggleCISPolicy = (policyPath: string) => {
    setSelectedCISPolicies(prev => {
      const next = new Set(prev);
      if (next.has(policyPath)) {
        next.delete(policyPath);
      } else {
        next.add(policyPath);
      }
      return next;
    });
  };

  const toggleCISCategoryPolicies = (categoryFolder: string) => {
    if (!cisManifest) return;
    const categoryPolicies = cisManifest.files.filter(f => f.category === categoryFolder).map(f => f.path);
    const allSelected = categoryPolicies.every(p => selectedCISPolicies.has(p));

    setSelectedCISPolicies(prev => {
      const next = new Set(prev);
      if (allSelected) {
        categoryPolicies.forEach(p => next.delete(p));
      } else {
        categoryPolicies.forEach(p => next.add(p));
      }
      return next;
    });
  };

  const handleSelectAllCIS = () => {
    if (!cisManifest) return;
    setSelectedCISPolicies(new Set(cisManifest.files.map(f => f.path)));
  };

  const handleDeselectAllCIS = () => {
    setSelectedCISPolicies(new Set());
  };

  const isCISCategoryFullySelected = (categoryFolder: string): boolean => {
    if (!cisManifest) return false;
    const categoryPolicies = cisManifest.files.filter(f => f.category === categoryFolder);
    return categoryPolicies.every(p => selectedCISPolicies.has(p.path));
  };

  const isCISCategoryPartiallySelected = (categoryFolder: string): boolean => {
    if (!cisManifest) return false;
    const categoryPolicies = cisManifest.files.filter(f => f.category === categoryFolder);
    const selectedCount = categoryPolicies.filter(p => selectedCISPolicies.has(p.path)).length;
    return selectedCount > 0 && selectedCount < categoryPolicies.length;
  };

  // Keep legacy handlers for backwards compatibility with existing code
  const handleCISCategoryToggle = (categoryId: CISCategoryId) => {
    setCISCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  // Baseline platform handlers
  const togglePlatformExpanded = (platform: OIBPlatformId) => {
    setExpandedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  };

  const togglePlatformPolicies = (platform: OIBPlatformId) => {
    if (!baselineManifest) return;
    const platformPolicies = baselineManifest.files.filter(f => f.platform === platform).map(f => f.path);
    const current = selectedItems["baseline"] || new Set();
    const allSelected = platformPolicies.every(p => current.has(p));

    setSelectedItems(prev => {
      const next = new Set(prev["baseline"] || []);
      if (allSelected) {
        platformPolicies.forEach(p => next.delete(p));
      } else {
        platformPolicies.forEach(p => next.add(p));
      }
      return { ...prev, baseline: next };
    });
  };

  // Global select/deselect - respects search filter
  const handleSelectAll = () => {
    const search = searchQuery.toLowerCase().trim();

    if (search) {
      // When searching, only select matching categories and items
      const matchingTargetIds = TARGETS.filter(t => categoryMatchesSearch(t)).map(t => t.id);
      setTargets(prev => [...new Set([...prev, ...matchingTargetIds])]);
      setExpandedCategories(prev => new Set([...prev, ...matchingTargetIds]));

      // Select only matching items in each category
      const newSelected: Record<string, Set<string>> = {};
      for (const [cat, items] of Object.entries(categoryItems)) {
        const filtered = items.filter(item =>
          item.displayName.toLowerCase().includes(search) ||
          item.description?.toLowerCase().includes(search) ||
          item.subtype?.toLowerCase().includes(search)
        );
        if (filtered.length > 0) {
          const current = selectedItems[cat] || new Set();
          newSelected[cat] = new Set([...current, ...filtered.map(i => i.displayName)]);
        }
      }
      setSelectedItems(prev => ({ ...prev, ...newSelected }));

      // Handle baseline
      if (baselineManifest && matchingTargetIds.includes("baseline")) {
        const matchingPolicies = baselineManifest.files.filter(f =>
          f.displayName.toLowerCase().includes(search) ||
          f.platform.toLowerCase().includes(search) ||
          f.policyType?.toLowerCase().includes(search)
        ).map(f => f.path);
        setSelectedItems(prev => ({
          ...prev,
          baseline: new Set([...(prev.baseline || []), ...matchingPolicies])
        }));
      }

      // Handle CIS
      if (cisManifest && matchingTargetIds.includes("cisBaseline")) {
        const matchingCIS = cisManifest.files.filter(f =>
          f.displayName.toLowerCase().includes(search) ||
          f.category.toLowerCase().includes(search) ||
          f.subcategory?.toLowerCase().includes(search)
        ).map(f => f.path);
        setSelectedCISPolicies(prev => new Set([...prev, ...matchingCIS]));
        setCISCategories(CIS_CATEGORIES.map(c => c.id));
      }
    } else {
      // No search - select everything
      setTargets(TARGETS.map(t => t.id));
      setCISCategories(CIS_CATEGORIES.map(c => c.id));
      setExpandedCategories(new Set(TARGETS.map(t => t.id)));
      const newSelected: Record<string, Set<string>> = {};
      for (const [cat, items] of Object.entries(categoryItems)) {
        newSelected[cat] = new Set(items.map(i => i.displayName));
      }
      setSelectedItems(prev => ({ ...prev, ...newSelected }));
    }
  };

  const handleDeselectAll = () => {
    const search = searchQuery.toLowerCase().trim();

    if (search) {
      // When searching, only deselect matching items (keep non-matching selections)
      const newSelected: Record<string, Set<string>> = {};
      for (const [cat, items] of Object.entries(categoryItems)) {
        const current = selectedItems[cat] || new Set();
        const matchingNames = items.filter(item =>
          item.displayName.toLowerCase().includes(search) ||
          item.description?.toLowerCase().includes(search) ||
          item.subtype?.toLowerCase().includes(search)
        ).map(i => i.displayName);
        // Remove matching items from selection
        const filtered = new Set([...current].filter(name => !matchingNames.includes(name)));
        newSelected[cat] = filtered;
      }
      setSelectedItems(prev => ({ ...prev, ...newSelected }));

      // Handle baseline
      if (baselineManifest) {
        const matchingPolicies = baselineManifest.files.filter(f =>
          f.displayName.toLowerCase().includes(search) ||
          f.platform.toLowerCase().includes(search) ||
          f.policyType?.toLowerCase().includes(search)
        ).map(f => f.path);
        setSelectedItems(prev => {
          const current = prev.baseline || new Set();
          return {
            ...prev,
            baseline: new Set([...current].filter(p => !matchingPolicies.includes(p)))
          };
        });
      }

      // Handle CIS
      if (cisManifest) {
        const matchingCIS = cisManifest.files.filter(f =>
          f.displayName.toLowerCase().includes(search) ||
          f.category.toLowerCase().includes(search) ||
          f.subcategory?.toLowerCase().includes(search)
        ).map(f => f.path);
        setSelectedCISPolicies(prev => new Set([...prev].filter(p => !matchingCIS.includes(p))));
      }
    } else {
      // No search - deselect everything
      setTargets([]);
      setCISCategories([]);
      setExpandedCategories(new Set());
      setSelectedItems({});
      setSelectedCISPolicies(new Set());
    }
  };

  const handleContinue = () => {
    setSelectedTargets(targets);
    setSelectedCISCategories(cisCategories);

    // Build category selections
    const selections: CategorySelections = {};
    for (const target of targets) {
      if (target === "baseline") {
        setBaselineSelection({
          platforms: [],
          selectedPolicies: Array.from(selectedItems["baseline"] || []),
          excludedPolicies: [],
        });
        selections.baseline = {
          platforms: [],
          selectedPolicies: Array.from(selectedItems["baseline"] || []),
          excludedPolicies: [],
        };
      } else if (target === "cisBaseline") {
        // Save selected CIS policies
        selections.cisBaseline = {
          selectedItems: Array.from(selectedCISPolicies),
        };
      } else if (target !== "notification") {
        // Type-safe assignment for non-baseline categories
        const categorySelection = { selectedItems: Array.from(selectedItems[target] || []) };
        if (target === "groups") selections.groups = categorySelection;
        else if (target === "filters") selections.filters = categorySelection;
        else if (target === "compliance") selections.compliance = categorySelection;
        else if (target === "conditionalAccess") selections.conditionalAccess = categorySelection;
        else if (target === "appProtection") selections.appProtection = categorySelection;
        else if (target === "enrollment") selections.enrollment = categorySelection;
      }
    }
    setCategorySelections(selections);

    // Navigate
    if (targets.includes("baseline")) {
      nextStep();
    } else {
      nextStep();
      nextStep();
    }
  };

  // Count helpers
  const getSelectedCount = (category: TaskCategory): number => {
    if (category === "cisBaseline") {
      return selectedCISPolicies.size;
    }
    return selectedItems[category]?.size || 0;
  };

  const getTotalCount = (category: TaskCategory): number => {
    if (category === "cisBaseline") {
      return cisManifest?.totalFiles || TEMPLATE_METADATA.cisBaseline?.count || 0;
    }
    if (category === "baseline" && baselineManifest) {
      return baselineManifest.totalFiles;
    }
    // Check categoryItems first, then fallback to TEMPLATE_METADATA if the category exists there
    if (categoryItems[category]?.length) {
      return categoryItems[category].length;
    }
    const meta = TEMPLATE_METADATA[category as keyof typeof TEMPLATE_METADATA];
    return meta?.count || 0;
  };

  const totalSelectedCount = TARGETS.filter(t => targets.includes(t.id)).reduce(
    (sum, t) => sum + getSelectedCount(t.id),
    0
  );

  // Search filter helpers
  const normalizedSearch = searchQuery.toLowerCase().trim();

  const filterItems = (items: CategoryItem[]): CategoryItem[] => {
    if (!normalizedSearch) return items;
    return items.filter(item =>
      item.displayName.toLowerCase().includes(normalizedSearch) ||
      item.description?.toLowerCase().includes(normalizedSearch) ||
      item.subtype?.toLowerCase().includes(normalizedSearch)
    );
  };

  const categoryMatchesSearch = (target: Target): boolean => {
    if (!normalizedSearch) return true;
    // Check if category name matches
    if (target.label.toLowerCase().includes(normalizedSearch)) return true;
    if (target.description.toLowerCase().includes(normalizedSearch)) return true;
    // Check if any items match
    const items = categoryItems[target.id] || [];
    if (items.some(item =>
      item.displayName.toLowerCase().includes(normalizedSearch) ||
      item.description?.toLowerCase().includes(normalizedSearch) ||
      item.subtype?.toLowerCase().includes(normalizedSearch)
    )) return true;
    // Check baseline policies
    if (target.id === "baseline" && baselineManifest) {
      if (baselineManifest.files.some(f =>
        f.displayName.toLowerCase().includes(normalizedSearch) ||
        f.platform.toLowerCase().includes(normalizedSearch) ||
        f.policyType?.toLowerCase().includes(normalizedSearch)
      )) return true;
    }
    // Check CIS policies
    if (target.id === "cisBaseline" && cisManifest) {
      if (cisManifest.files.some(f =>
        f.displayName.toLowerCase().includes(normalizedSearch) ||
        f.category.toLowerCase().includes(normalizedSearch) ||
        f.subcategory?.toLowerCase().includes(normalizedSearch)
      )) return true;
    }
    return false;
  };

  const filteredTargets = TARGETS.filter(categoryMatchesSearch);

  // Validation
  const isValid = targets.length > 0 &&
    targets.every(t => {
      if (t === "cisBaseline") return selectedCISPolicies.size > 0 || cisLoading;
      return (selectedItems[t]?.size || 0) > 0 || loadingCategories.has(t);
    });

  // Baseline helpers
  const isPlatformFullySelected = (platform: OIBPlatformId): boolean => {
    if (!baselineManifest) return false;
    const platformPolicies = baselineManifest.files.filter(f => f.platform === platform);
    const selected = selectedItems["baseline"] || new Set();
    return platformPolicies.every(p => selected.has(p.path));
  };

  const isPlatformPartiallySelected = (platform: OIBPlatformId): boolean => {
    if (!baselineManifest) return false;
    const platformPolicies = baselineManifest.files.filter(f => f.platform === platform);
    const selected = selectedItems["baseline"] || new Set();
    const count = platformPolicies.filter(p => selected.has(p.path)).length;
    return count > 0 && count < platformPolicies.length;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Target Selection</CardTitle>
        <CardDescription>
          Choose which configurations to deploy or remove. Expand each category to select individual items.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Search and actions bar */}
        <div className="flex gap-2 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search categories and policies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleSelectAll}>
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={handleDeselectAll}>
            Deselect All
          </Button>
        </div>

        {/* Search results info */}
        {normalizedSearch && (
          <p className="text-sm text-muted-foreground">
            Showing {filteredTargets.length} of {TARGETS.length} categories matching &quot;{searchQuery}&quot;
          </p>
        )}

        <div className="space-y-4">
          {filteredTargets.length === 0 && normalizedSearch && (
            <div className="text-center py-8 text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No categories or policies match &quot;{searchQuery}&quot;</p>
              <Button variant="link" onClick={() => setSearchQuery("")} className="mt-2">
                Clear search
              </Button>
            </div>
          )}
          {filteredTargets.map(target => {
            const isExpanded = expandedCategories.has(target.id);
            const isLoading = loadingCategories.has(target.id);
            const items = categoryItems[target.id] || [];
            const selected = selectedItems[target.id] || new Set();
            const selectedCount = getSelectedCount(target.id);
            const totalCount = getTotalCount(target.id);

            // Calculate filtered count and selected matching count for display
            const getFilteredData = (): { filteredCount: number; selectedMatchingCount: number; isLoaded: boolean } => {
              if (!normalizedSearch) {
                return { filteredCount: totalCount, selectedMatchingCount: selectedCount, isLoaded: true };
              }
              if (target.id === "baseline") {
                if (!baselineManifest) {
                  // Data not loaded yet - can't filter, show total from metadata
                  return { filteredCount: totalCount, selectedMatchingCount: 0, isLoaded: false };
                }
                const matching = baselineManifest.files.filter(f =>
                  f.displayName.toLowerCase().includes(normalizedSearch) ||
                  f.platform.toLowerCase().includes(normalizedSearch) ||
                  f.policyType?.toLowerCase().includes(normalizedSearch)
                );
                const selectedMatching = matching.filter(f => selected.has(f.path)).length;
                return { filteredCount: matching.length, selectedMatchingCount: selectedMatching, isLoaded: true };
              }
              if (target.id === "cisBaseline") {
                if (!cisManifest) {
                  // Data not loaded yet - can't filter, show total from metadata
                  return { filteredCount: totalCount, selectedMatchingCount: 0, isLoaded: false };
                }
                const matching = cisManifest.files.filter(f =>
                  f.displayName.toLowerCase().includes(normalizedSearch) ||
                  f.category.toLowerCase().includes(normalizedSearch) ||
                  f.subcategory?.toLowerCase().includes(normalizedSearch)
                );
                const selectedMatching = matching.filter(f => selectedCISPolicies.has(f.path)).length;
                return { filteredCount: matching.length, selectedMatchingCount: selectedMatching, isLoaded: true };
              }
              // For other categories, check if items are loaded
              if (items.length === 0 && !loadingCategories.has(target.id)) {
                // Data not loaded yet
                return { filteredCount: totalCount, selectedMatchingCount: 0, isLoaded: false };
              }
              const filtered = filterItems(items);
              const selectedMatching = filtered.filter(i => selected.has(i.displayName)).length;
              return { filteredCount: filtered.length, selectedMatchingCount: selectedMatching, isLoaded: true };
            };
            const { filteredCount, selectedMatchingCount, isLoaded } = getFilteredData();
            // When searching but data not loaded, show total count (will update when loaded)
            const displayCount = normalizedSearch && isLoaded ? filteredCount : totalCount;
            const displaySelectedCount = normalizedSearch ? selectedMatchingCount : selectedCount;

            return (
              <div key={target.id}>
                {/* Category Header */}
                <div
                  className={`flex items-start space-x-3 space-y-0 rounded-md border p-4 ${
                    targets.includes(target.id) && isExpanded ? "rounded-b-none border-b-0" : ""
                  }`}
                >
                  <Checkbox
                    id={target.id}
                    checked={targets.includes(target.id)}
                    onCheckedChange={() => handleToggle(target.id)}
                  />
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={target.id} className="font-medium cursor-pointer">
                        {target.label}{" "}
                        <span className="text-sm text-muted-foreground">
                          {normalizedSearch && !isLoaded ? (
                            // Data not loaded yet, show total count
                            `(${totalCount} items)`
                          ) : targets.includes(target.id) ? (
                            `(${displaySelectedCount} of ${displayCount}${normalizedSearch ? " matching" : " items"})`
                          ) : (
                            `(${displayCount}${normalizedSearch ? " matching" : " items"})`
                          )}
                        </span>
                      </Label>
                    </div>
                    <p className="text-sm text-muted-foreground">{target.description}</p>
                  </div>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground transition-colors p-1"
                    onClick={e => {
                      e.preventDefault();
                      if (!targets.includes(target.id)) {
                        handleToggle(target.id);
                      } else {
                        toggleCategoryExpanded(target.id);
                      }
                    }}
                  >
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : targets.includes(target.id) && isExpanded ? (
                      <ChevronDown className="h-5 w-5" />
                    ) : (
                      <ChevronRight className="h-5 w-5" />
                    )}
                  </button>
                </div>

                {/* CIS Sub-categories (by category folder) */}
                {target.id === "cisBaseline" && targets.includes("cisBaseline") && isExpanded && (
                  <div className="border border-t-0 rounded-b-md p-4 bg-muted/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-muted-foreground">Select CIS Benchmark Policies</p>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={handleSelectAllCIS} className="h-7 text-xs">All</Button>
                        <Button variant="ghost" size="sm" onClick={handleDeselectAllCIS} className="h-7 text-xs">None</Button>
                      </div>
                    </div>

                    {cisLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        <span className="text-sm text-muted-foreground">Loading CIS policies...</span>
                      </div>
                    ) : cisManifest ? (
                      <div className="space-y-2">
                        {cisManifest.categories.map(category => {
                          const isCatExpanded = expandedCISCategories.has(category.folder);
                          const categoryPolicies = cisManifest.files.filter(f => f.category === category.folder);
                          const filteredCategoryPolicies = normalizedSearch
                            ? categoryPolicies.filter(p =>
                                p.displayName.toLowerCase().includes(normalizedSearch) ||
                                p.subcategory?.toLowerCase().includes(normalizedSearch)
                              )
                            : categoryPolicies;
                          const selectedInCategory = categoryPolicies.filter(p => selectedCISPolicies.has(p.path)).length;
                          const selectedMatchingInCategory = filteredCategoryPolicies.filter(p => selectedCISPolicies.has(p.path)).length;
                          const filteredCount = filteredCategoryPolicies.length;
                          const displayCount = normalizedSearch ? filteredCount : category.count;
                          const displaySelected = normalizedSearch ? selectedMatchingInCategory : selectedInCategory;

                          // Hide category if no policies match search
                          if (normalizedSearch && filteredCount === 0) return null;

                          return (
                            <div key={category.folder} className="border rounded-md bg-background">
                              <div className="flex items-center p-3 gap-2">
                                <Checkbox
                                  id={`cis-cat-${category.folder}`}
                                  checked={isCISCategoryFullySelected(category.folder)}
                                  className={isCISCategoryPartiallySelected(category.folder) ? "data-[state=checked]:bg-primary/50" : ""}
                                  onCheckedChange={() => toggleCISCategoryPolicies(category.folder)}
                                />
                                <div
                                  className="flex-1 flex items-center justify-between cursor-pointer"
                                  onClick={() => toggleCISCategoryExpanded(category.folder)}
                                >
                                  <div>
                                    <Label className="font-medium cursor-pointer">{category.name}</Label>
                                    <p className="text-xs text-muted-foreground">
                                      {displaySelected} of {displayCount} policies{normalizedSearch ? " matching" : " selected"}
                                    </p>
                                  </div>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                    {isCatExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  </Button>
                                </div>
                              </div>
                              {isCatExpanded && (
                                <div className="border-t px-3 py-2 space-y-1 max-h-64 overflow-y-auto">
                                  {(() => {
                                    const filteredCISPolicies = normalizedSearch
                                      ? categoryPolicies.filter(p =>
                                          p.displayName.toLowerCase().includes(normalizedSearch) ||
                                          p.subcategory?.toLowerCase().includes(normalizedSearch)
                                        )
                                      : categoryPolicies;
                                    return filteredCISPolicies.length > 0 ? (
                                      filteredCISPolicies.map(policy => (
                                        <div key={policy.path} className="flex items-center space-x-2 py-1 px-2 rounded hover:bg-muted/50">
                                          <Checkbox
                                            id={`cis-policy-${policy.path}`}
                                            checked={selectedCISPolicies.has(policy.path)}
                                            onCheckedChange={() => toggleCISPolicy(policy.path)}
                                          />
                                          <Label htmlFor={`cis-policy-${policy.path}`} className="text-sm cursor-pointer flex-1 truncate" title={policy.displayName}>
                                            {policy.displayName}
                                          </Label>
                                          <span className="text-xs text-muted-foreground shrink-0">{policy.subcategory}</span>
                                        </div>
                                      ))
                                    ) : (
                                      <p className="text-sm text-muted-foreground py-2">No policies match your search.</p>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Failed to load CIS manifest.</p>
                    )}

                    {selectedCISPolicies.size === 0 && !cisLoading && (
                      <p className="text-sm text-destructive">Please select at least one CIS policy</p>
                    )}
                  </div>
                )}

                {/* Baseline Sub-categories (by platform) */}
                {target.id === "baseline" && targets.includes("baseline") && isExpanded && (
                  <div className="border border-t-0 rounded-b-md p-4 bg-muted/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-muted-foreground">Select OpenIntuneBaseline Policies</p>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => selectAllInCategory("baseline")} className="h-7 text-xs">All</Button>
                        <Button variant="ghost" size="sm" onClick={() => deselectAllInCategory("baseline")} className="h-7 text-xs">None</Button>
                      </div>
                    </div>

                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        <span className="text-sm text-muted-foreground">Loading baseline policies...</span>
                      </div>
                    ) : baselineManifest ? (
                      <div className="space-y-2">
                        {baselineManifest.platforms.map(platform => {
                          const platformId = platform.id as OIBPlatformId;
                          const isPlatExpanded = expandedPlatforms.has(platformId);
                          const platformPolicies = baselineManifest.files.filter(f => f.platform === platformId);
                          const filteredPlatformPolicies = normalizedSearch
                            ? platformPolicies.filter(p =>
                                p.displayName.toLowerCase().includes(normalizedSearch) ||
                                p.policyType?.toLowerCase().includes(normalizedSearch)
                              )
                            : platformPolicies;
                          const selectedInPlatform = platformPolicies.filter(p => selected.has(p.path)).length;
                          const selectedMatchingInPlatform = filteredPlatformPolicies.filter(p => selected.has(p.path)).length;
                          const filteredCount = filteredPlatformPolicies.length;
                          const displayCount = normalizedSearch ? filteredCount : platform.count;
                          const displaySelected = normalizedSearch ? selectedMatchingInPlatform : selectedInPlatform;

                          // Hide platform if no policies match search
                          if (normalizedSearch && filteredCount === 0) return null;

                          return (
                            <div key={platformId} className="border rounded-md bg-background">
                              <div className="flex items-center p-3 gap-2">
                                <Checkbox
                                  id={`platform-${platformId}`}
                                  checked={isPlatformFullySelected(platformId)}
                                  className={isPlatformPartiallySelected(platformId) ? "data-[state=checked]:bg-primary/50" : ""}
                                  onCheckedChange={() => togglePlatformPolicies(platformId)}
                                />
                                <div
                                  className="flex-1 flex items-center justify-between cursor-pointer"
                                  onClick={() => togglePlatformExpanded(platformId)}
                                >
                                  <div>
                                    <Label className="font-medium cursor-pointer">{PLATFORM_NAMES[platformId] || platform.name}</Label>
                                    <p className="text-xs text-muted-foreground">
                                      {displaySelected} of {displayCount} policies{normalizedSearch ? " matching" : " selected"}
                                    </p>
                                  </div>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                    {isPlatExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                  </Button>
                                </div>
                              </div>
                              {isPlatExpanded && (
                                <div className="border-t px-3 py-2 space-y-1 max-h-64 overflow-y-auto">
                                  {(() => {
                                    const filteredPolicies = normalizedSearch
                                      ? platformPolicies.filter(p =>
                                          p.displayName.toLowerCase().includes(normalizedSearch) ||
                                          p.policyType?.toLowerCase().includes(normalizedSearch)
                                        )
                                      : platformPolicies;
                                    return filteredPolicies.length > 0 ? (
                                      filteredPolicies.map(policy => (
                                        <div key={policy.path} className="flex items-center space-x-2 py-1 px-2 rounded hover:bg-muted/50">
                                          <Checkbox
                                            id={`policy-${policy.path}`}
                                            checked={selected.has(policy.path)}
                                            onCheckedChange={() => toggleItem("baseline", policy.path)}
                                          />
                                          <Label htmlFor={`policy-${policy.path}`} className="text-sm cursor-pointer flex-1 truncate" title={policy.displayName}>
                                            {policy.displayName}
                                          </Label>
                                          <span className="text-xs text-muted-foreground shrink-0">{policy.policyType || "Config"}</span>
                                        </div>
                                      ))
                                    ) : (
                                      <p className="text-sm text-muted-foreground py-2">No policies match your search.</p>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Failed to load baseline manifest.</p>
                    )}

                    {selected.size === 0 && !isLoading && (
                      <p className="text-sm text-destructive">Please select at least one baseline policy</p>
                    )}
                  </div>
                )}

                {/* Generic category items (groups, filters, compliance, etc.) */}
                {target.id !== "cisBaseline" && target.id !== "baseline" && targets.includes(target.id) && isExpanded && (
                  <div className="border border-t-0 rounded-b-md p-4 bg-muted/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-muted-foreground">Select {target.label}</p>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => selectAllInCategory(target.id)} className="h-7 text-xs">All</Button>
                        <Button variant="ghost" size="sm" onClick={() => deselectAllInCategory(target.id)} className="h-7 text-xs">None</Button>
                      </div>
                    </div>

                    {isLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        <span className="text-sm text-muted-foreground">Loading {target.label.toLowerCase()}...</span>
                      </div>
                    ) : items.length > 0 ? (
                      (() => {
                        const filteredItems = filterItems(items);
                        return filteredItems.length > 0 ? (
                          <div className="space-y-1 max-h-64 overflow-y-auto border rounded-md bg-background p-2">
                            {filteredItems.map(item => (
                              <div key={item.displayName} className="flex items-center space-x-2 py-1 px-2 rounded hover:bg-muted/50">
                                <Checkbox
                                  id={`item-${target.id}-${item.displayName}`}
                                  checked={selected.has(item.displayName)}
                                  onCheckedChange={() => toggleItem(target.id, item.displayName)}
                                />
                                <Label
                                  htmlFor={`item-${target.id}-${item.displayName}`}
                                  className="text-sm cursor-pointer flex-1 truncate"
                                  title={item.description || item.displayName}
                                >
                                  {item.displayName}
                                </Label>
                                {item.subtype && (
                                  <span className="text-xs text-muted-foreground shrink-0">{item.subtype}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No items match your search.</p>
                        );
                      })()
                    ) : (
                      <p className="text-sm text-muted-foreground">No items available.</p>
                    )}

                    {selected.size === 0 && !isLoading && items.length > 0 && (
                      <p className="text-sm text-destructive">Please select at least one {target.label.toLowerCase().replace(/s$/, "")}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {targets.length > 0 && (
          <div className="rounded-md bg-muted p-4">
            <p className="text-sm font-medium">
              Total: {targets.length} {targets.length === 1 ? "category" : "categories"} ({totalSelectedCount} items)
            </p>
          </div>
        )}

        <div className="flex gap-4">
          <Button variant="outline" onClick={previousStep} className="flex-1">
            Back
          </Button>
          <Button onClick={handleContinue} disabled={!isValid} className="flex-1">
            Continue
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
