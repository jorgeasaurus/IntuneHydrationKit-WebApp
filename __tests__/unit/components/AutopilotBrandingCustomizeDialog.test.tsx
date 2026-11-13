import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import {
  AutopilotBrandingCustomizeControl,
  AutopilotBrandingCustomizeDialog,
} from '@/components/wizard/AutopilotBrandingCustomizeDialog'
import {
  AUTOPILOT_BRANDING_APPS,
  AUTOPILOT_BRANDING_KEPT_APPS,
  AUTOPILOT_BRANDING_TASKS,
  getDefaultAutopilotBrandingCustomization,
  type AutopilotBrandingCustomization,
} from '@/lib/win32/autopilotBrandingConfig'

const NOTE =
  'Create skips an app that already exists. To change the settings of an existing app, delete it and create it again.'

function renderDialog(value?: AutopilotBrandingCustomization) {
  const onSave = vi.fn()
  const onOpenChange = vi.fn()
  render(<AutopilotBrandingCustomizeDialog open onOpenChange={onOpenChange} value={value} onSave={onSave} />)
  return { onSave, onOpenChange }
}

function appCheckbox(packageName: string): HTMLElement {
  return screen.getByRole('checkbox', { name: new RegExp(packageName.replace(/\./g, '\\.')) })
}

describe('AutopilotBrandingCustomizeDialog', () => {
  it('starts with the kit configuration: 29 apps checked, the seven work apps unchecked, all tasks on', () => {
    renderDialog()

    expect(screen.getByRole('dialog', { name: 'Customize Autopilot Branding' })).toBeInTheDocument()
    expect(screen.getByText(NOTE)).toBeVisible()
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(AUTOPILOT_BRANDING_APPS.length)
    expect(checkboxes.filter((checkbox) => checkbox.getAttribute('aria-checked') === 'true')).toHaveLength(29)
    for (const name of AUTOPILOT_BRANDING_KEPT_APPS) expect(appCheckbox(name)).not.toBeChecked()
    expect(screen.getByText('29 of 36 apps selected')).toBeInTheDocument()

    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(AUTOPILOT_BRANDING_TASKS.length)
    for (const toggle of switches) expect(toggle).toBeChecked()
    expect(screen.getByRole('button', { name: 'Reset to defaults' })).toBeDisabled()
  })

  it('gives every checkbox and toggle an accessible name and description', () => {
    renderDialog()

    expect(screen.getByRole('checkbox', { name: 'Solitaire Collection Microsoft.MicrosoftSolitaireCollection' }))
      .toBeChecked()
    // An app without a certain plain name shows its package name only.
    expect(screen.getByRole('checkbox', { name: '9NHT9RB2F4HD' })).toBeChecked()
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toHaveAccessibleName()
    const widgets = screen.getByRole('switch', { name: /Hide Widgets/ })
    expect(widgets).toHaveAccessibleDescription('Hides the Widgets button on the taskbar.')
    for (const toggle of screen.getAllByRole('switch')) expect(toggle).toHaveAccessibleName()
    expect(screen.getByRole('group', { name: 'Apps to remove' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Other cleanup tasks' })).toBeInTheDocument()
  })

  it('saves the changed choices in catalog order', async () => {
    const user = userEvent.setup()
    const { onSave, onOpenChange } = renderDialog()

    await user.click(appCheckbox('MSTeams'))
    await user.click(appCheckbox('Clipchamp.Clipchamp'))
    await user.click(screen.getByRole('switch', { name: /Update Edge/ }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    const defaults = getDefaultAutopilotBrandingCustomization()
    const expectedApps = AUTOPILOT_BRANDING_APPS.map((app) => app.packageName).filter(
      (name) => name === 'MSTeams' || (defaults.removedApps.includes(name) && name !== 'Clipchamp.Clipchamp'),
    )
    expect(onSave).toHaveBeenCalledWith({
      removedApps: expectedApps,
      enabledTasks: defaults.enabledTasks.filter((name) => name !== 'Update-ABEdge'),
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('saves no customization when the choices are the defaults', async () => {
    const user = userEvent.setup()
    const { onSave } = renderDialog()

    await user.click(appCheckbox('MSTeams'))
    await user.click(appCheckbox('MSTeams'))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith(undefined)
  })

  it('resets a saved customization to the defaults', async () => {
    const user = userEvent.setup()
    const { onSave } = renderDialog({ removedApps: ['MSTeams'], enabledTasks: [] })

    expect(appCheckbox('MSTeams')).toBeChecked()
    expect(appCheckbox('Clipchamp.Clipchamp')).not.toBeChecked()
    expect(screen.getByRole('switch', { name: /Hide Widgets/ })).not.toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }))
    expect(appCheckbox('MSTeams')).not.toBeChecked()
    expect(appCheckbox('Clipchamp.Clipchamp')).toBeChecked()
    expect(screen.getByRole('switch', { name: /Hide Widgets/ })).toBeChecked()

    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(undefined)
  })

  it('does not save when no app and no task is selected', async () => {
    const user = userEvent.setup()
    const { onSave } = renderDialog({ removedApps: ['MSTeams'], enabledTasks: [] })

    await user.click(appCheckbox('MSTeams'))

    expect(screen.getByRole('alert')).toHaveTextContent('Select at least one app to remove or one cleanup task.')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('is operable with the keyboard', async () => {
    const user = userEvent.setup()
    const { onSave } = renderDialog()

    const teams = appCheckbox('MSTeams')
    teams.focus()
    await user.keyboard(' ')
    expect(teams).toBeChecked()

    const widgets = screen.getByRole('switch', { name: /Hide Widgets/ })
    widgets.focus()
    await user.keyboard(' ')
    expect(widgets).not.toBeChecked()

    screen.getByRole('button', { name: 'Save' }).focus()
    await user.keyboard('{Enter}')
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ removedApps: expect.arrayContaining(['MSTeams']) }),
    )
    expect(onSave.mock.calls[0][0].enabledTasks).not.toContain('Hide-ABWidgets')
  })
})

describe('AutopilotBrandingCustomizeControl', () => {
  it('opens the dialog, shows the saved state, and discards a cancelled draft', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<AutopilotBrandingCustomizeControl value={undefined} onChange={onChange} />)

    expect(screen.queryByText('Customized')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Customize Autopilot Branding' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('checkbox', { name: /MSTeams/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(onChange).not.toHaveBeenCalled()

    // Each open starts from the saved value, not from the cancelled draft.
    await user.click(screen.getByRole('button', { name: 'Customize Autopilot Branding' }))
    expect(within(screen.getByRole('dialog')).getByRole('checkbox', { name: /MSTeams/ })).not.toBeChecked()

    rerender(
      <AutopilotBrandingCustomizeControl
        value={{ removedApps: ['MSTeams'], enabledTasks: [] }}
        onChange={onChange}
      />,
    )
    expect(screen.getByText('Customized')).toBeInTheDocument()
  })
})
