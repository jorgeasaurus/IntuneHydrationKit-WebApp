# Verbose Logging Implementation

**Date**: January 4, 2026
**Status**: ✅ COMPLETED

## Overview

Added comprehensive console logging throughout the hydration execution engine to provide detailed visibility into template lookup, conversion, and Graph API operations.

## Changes Made

### File: `lib/hydration/engine.ts`

#### 1. Task Queue Building Logs

Added logging to `buildTaskQueueAsync()` to show:
- Categories being processed
- Cache hits/misses
- Number of templates fetched
- Template names (first 5 + count)
- Total task count

**Example Output**:
```
[Task Queue] Building task queue for categories: ["groups"]
[Task Queue] Processing category: groups
[Task Queue] Cache miss for groups, fetching fresh templates...
[Task Queue] Fetching dynamic and static groups...
[Task Queue] ✓ Fetched 43 dynamic + 4 static groups
[Task Queue] Creating 47 tasks for groups: ["Intune - Autopilot Devices", "Intune - Non-Autopilot Devices", "Intune - Dell Devices", "Intune - HP Devices", "Intune - Lenovo Devices", ...]
[Task Queue] ✓ Task queue built successfully with 47 total tasks
```

#### 2. Group Task Execution Logs

Added logging to `executeGroupTask()` to show:
- Template lookup process
- Cache hits/misses
- Template found status
- Existence checks
- Template conversion details
- Creation confirmation

**Example Output**:
```
[Group Task] Looking up template for: "Intune - Autopilot Devices"
[Group Task] Found 47 cached group templates
[Group Task] ✓ Found template in cache: "Intune - Autopilot Devices"
[Group Task] Checking if group exists: "Intune - Autopilot Devices"
[Group Task] Converting simple template to full DeviceGroup format
[Group Task] Template converted: {
  displayName: "Intune - Autopilot Devices",
  mailNickname: "IntuneAutopilotDevices",
  hasMembershipRule: true
}
[Group Task] Creating group: "Intune - Autopilot Devices"
[Group Task] ✓ Group created successfully with ID: 12345678-abcd-...
```

**Error Output**:
```
[Group Task] Looking up template for: "Intune - Unknown Device"
[Group Task] Found 47 cached group templates
[Group Task] Template "Intune - Unknown Device" not found in cache
[Group Task] Trying hardcoded templates...
[Group Task] ✗ Template not found for: "Intune - Unknown Device"
```

#### 3. Filter Task Execution Logs

Added logging to `executeFilterTask()` to show:
- Template lookup process
- Cache hits/misses
- Template conversion details
- Filter platform and rule validation
- Creation confirmation

**Example Output**:
```
[Filter Task] Looking up template for: "Intune - Windows 11 Devices"
[Filter Task] Found 24 cached filter templates
[Filter Task] ✓ Found template in cache: "Intune - Windows 11 Devices"
[Filter Task] Checking if filter exists: "Intune - Windows 11 Devices"
[Filter Task] Converting simple template to full DeviceFilter format
[Filter Task] Template converted: {
  displayName: "Intune - Windows 11 Devices",
  platform: "windows10AndLater",
  hasRule: true
}
[Filter Task] Creating filter: "Intune - Windows 11 Devices"
[Filter Task] ✓ Filter created successfully with ID: 87654321-dcba-...
```

## Log Prefixes

All logs use consistent prefixes for easy filtering:

| Prefix | Component | Purpose |
|--------|-----------|---------|
| `[Task Queue]` | buildTaskQueueAsync | Task queue building and template fetching |
| `[Group Task]` | executeGroupTask | Group creation/deletion operations |
| `[Filter Task]` | executeFilterTask | Filter creation/deletion operations |

Future additions could include:
- `[Compliance Task]` - Compliance policy operations
- `[CA Task]` - Conditional Access operations
- `[App Protection Task]` - App protection policy operations

## Log Levels

Logs use appropriate console methods:

- `console.log()` - Informational messages (most operations)
- `console.error()` - Error conditions (template not found, API errors)

**Success indicators**: ✓ (check mark)
**Error indicators**: ✗ (X mark)

## Benefits

### 1. Template Lookup Debugging
- See exactly which template is being searched
- Know if cache is being used or templates are being fetched
- Understand why "Template not found" errors occur

### 2. Execution Flow Visibility
- Track each step of the creation process
- See template conversions in real-time
- Monitor API call success/failure

### 3. Performance Insights
- Identify cache hits vs. fetches
- See how many templates are loaded
- Track execution speed

### 4. Troubleshooting
- Quick identification of missing templates
- Clear error messages with context
- Ability to trace execution flow

## Browser Console Usage

### Viewing Logs

Open browser DevTools (F12) and navigate to the Console tab. Logs will appear in real-time during execution.

### Filtering Logs

Use the console filter to view specific components:

```
[Task Queue]         // Show only task queue operations
[Group Task]         // Show only group operations
[Filter Task]        // Show only filter operations
✓                    // Show only successes
✗                    // Show only errors
```

### Copying Logs

Right-click in console → "Save as..." to export logs for analysis.

## Example Full Execution Log

```
[Task Queue] Building task queue for categories: ["groups"]
[Task Queue] Processing category: groups
[Task Queue] ✓ Using 47 cached templates for groups
[Task Queue] Creating 47 tasks for groups: ["Intune - Autopilot Devices", "Intune - Non-Autopilot Devices", ...]
[Task Queue] ✓ Task queue built successfully with 47 total tasks

[Group Task] Looking up template for: "Intune - Autopilot Devices"
[Group Task] Found 47 cached group templates
[Group Task] ✓ Found template in cache: "Intune - Autopilot Devices"
[Group Task] Checking if group exists: "Intune - Autopilot Devices"
[Group Task] Converting simple template to full DeviceGroup format
[Group Task] Template converted: { displayName: "Intune - Autopilot Devices", ... }
[Group Task] Creating group: "Intune - Autopilot Devices"
[Group Task] ✓ Group created successfully with ID: abc123...

[Group Task] Looking up template for: "Intune - Non-Autopilot Devices"
[Group Task] Found 47 cached group templates
[Group Task] ✓ Found template in cache: "Intune - Non-Autopilot Devices"
[Group Task] Checking if group exists: "Intune - Non-Autopilot Devices"
[Group Task] Group already exists, skipping: "Intune - Non-Autopilot Devices"
...
```

## Testing

To test the verbose logging:

1. **Clear sessionStorage** to force fresh template fetches:
   ```javascript
   sessionStorage.clear();
   ```

2. **Open Browser Console** (F12 → Console tab)

3. **Run Preview Mode**:
   - Select "Dynamic Groups" in wizard
   - Choose "Preview" mode
   - Click "Start Preview"

4. **Observe Logs**:
   - Task queue building logs
   - Template lookup logs
   - Conversion logs (if applicable)
   - Success/error indicators

5. **Test Error Scenarios**:
   - Modify a template name to trigger "not found"
   - Observe detailed error logging

## Future Enhancements

- [ ] Add log levels (DEBUG, INFO, WARN, ERROR)
- [ ] Implement structured logging (JSON format)
- [ ] Add timing information for performance analysis
- [ ] Create log export functionality
- [ ] Add verbose mode toggle in settings
- [ ] Implement log aggregation for error reporting

## Troubleshooting with Logs

### Problem: "Template not found" errors

**Check logs for**:
```
[Group Task] Looking up template for: "Template Name"
[Group Task] Found X cached group templates
[Group Task] Template "Template Name" not found in cache
[Group Task] Trying hardcoded templates...
[Group Task] ✗ Template not found for: "Template Name"
```

**Common causes**:
1. Template name mismatch between cache and task
2. Cache was cleared between task creation and execution
3. Template not fetched from GitHub

### Problem: Tasks skipping unexpectedly

**Check logs for**:
```
[Group Task] Checking if group exists: "Template Name"
[Group Task] Group already exists, skipping: "Template Name"
```

**Resolution**: Object already exists in tenant, working as expected

### Problem: Slow execution

**Check logs for**:
```
[Task Queue] Cache miss for groups, fetching fresh templates...
```

**Occurring repeatedly**: Templates not being cached properly

---

**Implementation Completed**: January 4, 2026
**Lines of Logging Added**: ~60
**Components Enhanced**: 3 (buildTaskQueueAsync, executeGroupTask, executeFilterTask)
