import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  getPayloadODataType,
  summarizeTemplateSettings,
} from '@/components/templates/templateSettingsSummary'

function readBundledTemplate(relativePath: string): unknown {
  const filePath = path.join(process.cwd(), 'public', 'IntuneTemplates', relativePath)
  return JSON.parse(readFileSync(filePath, 'utf8').replace(/^﻿/, ''))
}

const rowsOf = (payload: unknown) =>
  (summarizeTemplateSettings(payload)?.rows ?? []).map(({ label, value, entry }) => ({
    label,
    value,
    ...(entry ? { entry } : {}),
  }))

describe('summarizeTemplateSettings', () => {
  it('lists Settings Catalog definitions with nested choice, simple, and group values', () => {
    const payload = {
      '@odata.type': '#microsoft.graph.deviceManagementConfigurationPolicy',
      name: '[IHD] Edge',
      settings: [
        {
          settingInstance: {
            settingDefinitionId: 'device_edge_smartscreen',
            choiceSettingValue: {
              value: 'device_edge_smartscreen_1',
              children: [
                {
                  settingDefinitionId: 'device_edge_smartscreen_level',
                  simpleSettingValue: { value: 3 },
                },
              ],
            },
          },
        },
        {
          settingInstance: {
            settingDefinitionId: 'device_asr',
            groupSettingCollectionValue: [
              {
                children: [
                  {
                    settingDefinitionId: 'device_asr_rule',
                    choiceSettingValue: { value: 'device_asr_rule_audit', children: [] },
                  },
                ],
              },
            ],
          },
        },
        {
          settingInstance: {
            settingDefinitionId: 'device_list',
            simpleSettingCollectionValue: [{ value: 'a' }, { value: 'b' }],
          },
        },
      ],
    }

    const summary = summarizeTemplateSettings(payload)
    expect(summary?.kind).toBe('settingsCatalog')
    expect(rowsOf(payload)).toEqual([
      { label: 'device_edge_smartscreen', value: '1' },
      { label: 'device_edge_smartscreen_level', value: '3' },
      { label: 'device_asr_rule', value: 'audit' },
      { label: 'device_list', value: 'a, b' },
    ])
    const keys = summary?.rows.map((row) => row.key) ?? []
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keeps each collection entry of the bundled OIB firewall rules template', () => {
    const payload = readBundledTemplate(
      'OpenIntuneBaseline/WINDOWS/IntuneManagement/SettingsCatalog/Win - OIB - ES - Windows Firewall - D - Security Rules - v3.8.json'
    )
    const summary = summarizeTemplateSettings(payload)
    const rows = summary?.rows ?? []
    const ruleDefinition = 'vendor_msft_firewall_mdmstore_firewallrules_{firewallrulename}'
    const enabledRows = rows.filter((row) => row.label === `${ruleDefinition}_enabled`)
    const nameRows = rows.filter((row) => row.label === `${ruleDefinition}_name`)

    // The file has 6 rules, and every rule sets the same "enabled" value.
    expect(enabledRows).toHaveLength(6)
    expect(nameRows).toHaveLength(6)
    expect(enabledRows.map((row) => row.entry)).toEqual(
      [1, 2, 3, 4, 5, 6].map((index) => `${ruleDefinition} #${index}`)
    )
    expect(new Set(nameRows.map((row) => row.value)).size).toBe(6)

    const keys = rows.map((row) => row.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keeps nested reference ids in the bundled phishing-resistant MFA policy', () => {
    const payload = readBundledTemplate(
      'ConditionalAccess/Require phishing-resistant multifactor authentication for admins.json'
    )
    const rows = rowsOf(payload)

    expect(rows).toContainEqual({ label: 'grantControls.operator', value: 'AND' })
    expect(rows).toContainEqual({
      label: 'grantControls.authenticationStrength.id',
      value: '00000000-0000-0000-0000-000000000004',
    })
    expect(rows.some((row) => row.label.includes('@odata'))).toBe(false)
    expect(rows.some((row) => row.label === 'displayName')).toBe(false)
  })

  it('lists configured properties and skips Graph metadata', () => {
    const payload = {
      '@odata.type': '#microsoft.graph.windows10CompliancePolicy',
      '@odata.context': 'https://graph.microsoft.com',
      'createdDateTime@odata.type': '#DateTimeOffset',
      id: '123',
      displayName: '[IHD] Windows',
      description: 'Imported by Intune Hydration Kit',
      _oibFilePath: 'WINDOWS/a.json',
      passwordRequired: true,
      osMinimumVersion: '10.0.22631',
      assignments: [],
      emptyList: [],
      unset: null,
      conditions: { platforms: { includePlatforms: ['android', 'iOS'] } },
      scheduledActionsForRule: [{ ruleName: 'a' }],
    }

    expect(rowsOf(payload)).toEqual([
      { label: 'passwordRequired', value: 'true' },
      { label: 'osMinimumVersion', value: '10.0.22631' },
      { label: 'conditions.platforms.includePlatforms', value: 'android, iOS' },
      { label: 'scheduledActionsForRule', value: '1 item' },
    ])
    expect(getPayloadODataType(payload)).toBe('#microsoft.graph.windows10CompliancePolicy')
  })

  it('returns null when nothing can be summarized', () => {
    expect(summarizeTemplateSettings(null)).toBeNull()
    expect(summarizeTemplateSettings('text')).toBeNull()
    expect(summarizeTemplateSettings({ displayName: 'Only a name' })).toBeNull()
    expect(getPayloadODataType(null)).toBeUndefined()
  })
})
