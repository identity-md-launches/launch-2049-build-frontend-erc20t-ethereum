# ERC20T design system

## Overview

ERC20T is a working launch and management interface for token creators. The visual hierarchy puts the creation form immediately below the product name and a short explanation. A forest-green preview provides a persistent view of allocation and tax economics on wide screens. Discovery and management reuse the same shell, headings, controls and restrained borders.

The authoritative implementation is `src/styles.css`, shared primitives in `src/ui.tsx`, and the application shell in `src/App.tsx`. This document describes the final source, not a proposed redesign.

## Colors

The palette uses hex CSS primitives and semantic aliases in `:root`.

| Semantic role | Token and value | Use |
| --- | --- | --- |
| Page | `--bg` → `--gray-50`, `#f6f7f4` | Main background |
| Surface | `--surface` → `--white`, `#fff` | Forms, navigation and dialogs |
| Text | `--text` → `--gray-900`, `#24382f` | Body text and labels |
| Secondary text | `--muted` → `--gray-500`, `#606d63` | Hints and inactive steps |
| Border | `--border` → `--gray-200`, `#dce2d8` | Structural dividers and controls |
| Subtle surface | `--gray-100`, `#eef1eb` | Inactive step and selected-neutral surfaces |
| Strong secondary | `--gray-700`, `#3f5045` | Supporting foregrounds |
| Accent | `--accent` → `--green-800`, `#174d3b` | Primary buttons and selected controls |
| Accent hover | `--accent-hover` → `--green-700`, `#1d5b43` | Hover feedback |
| Accent surface | `--green-50`, `#e9f0e5` | Selected navigation and supporting emphasis |
| Preview | `--green-900`, `#173e31` | Economics preview background |
| Preview accent | `--green-200`, `#d5efbd` | Allocation and diagram accents |
| Focus | `--focus`, `#267b58` | Visible keyboard outlines |
| Success | `--success`, `#255c36` | Success notices with text and icon |
| Error | `--danger`, `#a43125` | Invalid fields and failure notices |
| Warning | `--warning`, `#795214` | Caution notices with text |

The preview uses `#f1f7ed` for its main text and `#b9cabe` for secondary text. Measured Chromium text/background ratios include body-on-white 12.49:1, muted-on-white 5.43:1, primary-button text 9.72:1, preview body 10.89:1, preview secondary 6.92:1 and inactive-step text 4.77:1. Measurement details are in `artifacts/rendered-contrast.json`. There is one light theme; the dark preview is a component surface.

## Typography

Inter Variable is bundled as a Latin WOFF2 through `@fontsource-variable/inter`; no font service is contacted. The CSS declares the font's 100–900 weight range and uses 400, 500 and 600. Fallbacks are Inter, an Arial-based `system-fallback` with 107% size adjustment, `system-ui` and sans-serif. Font display is `swap`; synthetic styles are disabled. Browser validation confirmed the local font loads.

| Token | Size at the default root | Roles |
| --- | ---: | --- |
| `--text-xs` | 12px / .75rem | Hints, status and compact metadata |
| `--text-sm` | 14px / .875rem | Controls, labels and body copy |
| `--text-md` | 16px / 1rem | Section subheads and mobile inputs |
| `--text-lg` | 20px / 1.25rem | Section headings and emphasized values |
| `--text-xl` | 28px / 1.75rem | Mobile page heading |
| `--text-display` | 40px / 2.5rem | Desktop page heading |

Body line height is 1.55; h1/h2 use 1.2 and h3 uses 1.4. Headings use 600 weight and modest negative tracking: −.035em for h1/h2 and −.015em for h3. Labels remain sentence case. Paragraphs are capped at 72ch, use `text-wrap: pretty`, and headings use balanced wrapping. Financial figures use tabular numerals where they update. Addresses wrap and remain selectable; shortened address labels have full-address copy or link access. Long token names wrap rather than forcing the layout wider.

## Layout

The desktop shell uses a 226px sidebar, a top utility bar and content capped at 1310px. Main content has 42px horizontal padding. The creation layout is a `minmax(0, 1.55fr)` form and a `minmax(290px, 1fr)` preview with shared top alignment. Panels use 28px interior padding. Spacing is mainly 4, 8, 12, 16, 20, 24, 28 and 32px, with larger shell gutters; these are CSS declarations, not a second token system.

Actual breakpoints in `src/styles.css`:

- **1600px and above:** more generous panel spacing.
- **1200px and below:** 200px sidebar, tighter shell spacing and a 1.45:1 form/preview ratio.
- **1020px and below:** sidebar becomes a mobile header/menu and a horizontal navigation row. Main content uses the available width.
- **720px and below:** the creation form and preview stack. The form comes first, the heading is 28px, gutters are 20px, inputs are 16px and dialogs become bottom sheets. Discovery rows, statistics and owner controls reflow.
- **370px and below:** gutters reduce to 15px and compact controls adjust without hiding the main action.
- **450px and below:** submitted transaction status and its controls stack.

Header items and step labels can wrap at enlarged text sizes. Grid children use constrained minimum widths, and addresses can wrap anywhere. Rendered checks covered 320, 390, 768, 1020 and 1440px, long token strings, RTL stress and 200% root text enlargement. At 390×844, the product, details form and Continue action are visible on the first screen. Native browser zoom and physical devices were not tested.

## Elevation & Depth

Ordinary panels have a border or a tonal background without a shadow. The preview gets its hierarchy from color. A native dialog provides the top layer and a dim backdrop; only the dialog uses `0 18px 80px #122e3533` elevation. Persistent transaction status is part of the document flow, so it does not cover form controls. Focus outlines are separate from borders and remain visible in forced-color mode.

## Shapes

Buttons generally use a 7px radius; text fields use 7px, panels 14px, and desktop dialogs 16px. At mobile widths form panels use 11px and bottom-sheet dialogs use an 18px top radius. Step counters and small token marks are circular. Thin dividers group large regions; space separates controls within a region. The small square ERC20T mark is a local SVG reused in the favicon and shell.

## Components

| Component/pattern | Source | Behavior and reuse |
| --- | --- | --- |
| Application shell | `src/App.tsx`, `.sidebar`, `.topbar`, `main` | Hash navigation with active route, mobile menu, wallet and network actions. Skip link focuses main content without changing the hash route. |
| Buttons | `.button.primary`, `.secondary`, `.text`, `.icon-button` | One prominent filled action per form stage; neutral secondary/back actions. Disabled, hover, active and visible-focus states. Main form controls are at least 44px tall. |
| `Field` | `src/ui.tsx` | Persistent label, hint, invalid state and associated error text. Numeric fields use decimal-friendly input modes. Forms focus the first invalid field. |
| `Toggle` | `src/ui.tsx` | A labelled native checkbox with a visual switch and explanatory copy; keyboard behavior stays native. |
| `Modal` | `src/ui.tsx` | Native `<dialog>` with title, close button, Escape dismissal, backdrop handling, modal focus containment and restoration to the trigger. Bottom sheet on mobile. |
| `Notice`, `Spinner` | `src/ui.tsx` | Loading, informational, warning, error and success states use text as well as color. Dynamic transaction status uses a live region. |
| `Address` | `src/ui.tsx` | Full address, copy action and explorer link. Long strings wrap. |
| Launch wizard and preview | `src/Launch.tsx` | Three stages, preserved inputs, editable prior stages, validation, allocation bar, stepped decay plot and contract-derived final review. This is a page pattern, not an exported generic wizard library. |
| Wallet chooser | `src/Wallet.tsx` | Recognizable wallet marks, detected browser wallet names, phone links and Coinbase option within one modal. Errors remain actionable. |
| Discovery list | `src/Discover.tsx` | Search/filter controls, real event results, empty state, loading, retry and earlier-window paging. |
| Owner confirmation | `src/Manage.tsx` | Exact contract, method purpose, target address/value and irreversible-action context before signing. Non-owners get read-only details. |
| Transaction state | `src/Transaction.tsx` | Simulation, wallet approval, pending, confirmed, reverted, replaced and unconfirmed states. Hash link and persisted tracking remain accessible after closing the form. |

Lucide icons use a consistent outline vocabulary and inherit current color. Icon-only buttons have accessible labels. Wallet brand icons are local assets with their original brand colors. Transitions target specific properties for 120ms and are enabled only when reduced motion is not requested. The loading spinner is also still under reduced motion. There is no entrance animation or `transition: all`.

## Do's and Don'ts

- Start a new page inside the existing shell with a page heading, one-line purpose and a shared panel/list pattern. Add its hash route and active navigation state in `App.tsx`.
- Reuse the semantic color aliases and six type sizes. Keep primary actions green and secondary actions neutral.
- Use `Field`, `Notice` and `Modal` for input, feedback and confirmation. Put actionable errors beside the affected control and preserve the user's inputs.
- Show exact amounts and full recipient addresses at the signing boundary. Use integer units in domain logic, even when a compact display uses formatted numbers.
- Preserve the first-screen action and allow long content to wrap. Do not add a marketing hero ahead of the form or a remote font dependency.
- Add motion only when it communicates state, and keep the reduced-motion path. Do not add panel shadows merely to separate content.
