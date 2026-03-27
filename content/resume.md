---
title: "Resume"
slug: "resume"
type: "pages"
layout: "resume"
icon: "📜"
---

## Summary

Infrastructure architect with 20+ years on Linux, specializing in system design, automation, and build engineering. I scope architecture, orchestrate AI-augmented development, and make judgment calls on what ships. Track record across network validation, firmware compliance, software supply chain security, release engineering, and full-stack product development. Currently automating IT infrastructure at Intel while simultaneously building and shipping production applications on a self-hosted Kubernetes cluster.

## Projects & Independent Work

### Personliness — Personality Assessment Platform

{{< projectlinks github="https://github.com/tuckermclean/personliness" live="https://personliness.dcxxiv.com" >}}

Designed and built a full-stack application that scores historical figures across 36 personality traits using an original psychometric rubric, then matches users to figures via trait-by-trait similarity analysis. Authored the scoring methodology including anti-halo rules, era normalization, source-critical confidence calibration, and multi-pass LLM refinement — producing defensible scores at $0.20/figure. 35+ figures scored. Stack: Django, React, PostgreSQL, Celery, Redis, Nginx, Docker. LLM integration with OpenAI, Anthropic, and Ollama backends. Deployed on self-hosted Kubernetes.

### The Monolith — Cross-Architecture Linux Live ISO Builder

{{< projectlinks github="https://github.com/tuckermclean/linux-live-iso-factory" >}}

Built a deterministic, Docker-based build system that cross-compiles a complete bootable Linux system targeting i486 through modern x86. Gentoo crossdev toolchain with musl libc; every binary statically linked to eliminate runtime dependencies and minimize seek latency on optical media. SquashFS root with overlayfs, hybrid BIOS boot, kernel 6.12 LTS, pinned package versions with checksum verification via portage. Full GNU userland with networking, SSH, text editors, and games. Boots on hardware spanning 30+ years of x86 architecture.

### Hybrid Cloud Kubernetes Platform

{{< projectlinks github="https://github.com/tuckermclean/k3s-lab" >}}

Architected and operate a multi-node K3s cluster spanning bare metal and cloud VMs. GitOps via FluxCD, Traefik ingress, Longhorn distributed storage, Authentik SSO, full observability stack. Runs production workloads including media ingestion pipelines, web applications, and automation services.

## Professional Experience

### IT Infrastructure Automation Engineer

#### Kelly OCG at Intel Corporation | Hillsboro, Oregon

{{< date >}}Feb 2026 – Present{{< /date >}}

- Automating IT lab compute infrastructure using **Ansible, AWX, and FOG** for OS provisioning and configuration management across Intel's Global IT Lab Compute.
- Building data visualization dashboards in **Grafana** and proprietary Intel tools to surface provisioning metrics and failure rates across lab environments.

### Fab Logistics & Automation Specialist

#### Randstad/GXO at Applied Materials (Intel Fabs) | Hillsboro, Oregon

{{< date >}}Sep 2025 – Jan 2026{{< /date >}}

- Tracked movement of equipment kits in **SAP** across Intel semiconductor fabrication facilities.
- Created operational dashboards and workflow automations in **Microsoft 365** (Power Automate, SharePoint, Excel) to streamline parts logistics and reduce manual tracking overhead.

### Software Engineering Consultant

#### Independent Contractor

{{< date >}}Feb 2025 – Sep 2025{{< /date >}}

- Technical review and specification writing for open-source projects — analyzing codebases, CI/CD pipelines, and GitHub issue histories to produce structured specs for AI-assisted development.
- Built containerized validation environments and reproducible test harnesses for client teams.

### Software Legal Compliance Liaison & Release Engineer

#### Intel Corporation | Hillsboro, Oregon

{{< date >}}Apr 2024 – Sep 2024{{< /date >}}

- Owned **software legal compliance (SWLC)** process for network interface drivers and firmware releases to top-tier accounts including Cisco.
- Ran static analysis (**Coverity**, previously **Klocwork**) and binary composition analysis (**Black Duck Binary Analysis**) on all built components — releases shipped only when analysis was green.
- Built multi-hundred-component **release projects for Cisco** — assembling drivers, firmware, and tools into validated release packages, personally performing the builds and managing the full compliance audit trail.
- Built **PowerBI dashboards** for tracking technical and security advisories across product lines. Point of contact for security advisory coordination and disclosure.

### Network Validation Engineer

#### Intel Corporation | Hillsboro, Oregon

{{< date >}}Jun 2022 – Apr 2024{{< /date >}}

- Designed and deployed an automated **OS provisioning platform (PXE/iPXE)** that **cut environment reproduction time by 50%** across the validation team.
- Validated NIC firmware, drivers, and virtualization workloads across Linux, ESXi, and Windows at scale.
- Wired **100G fiber backbones** and built **Python automation** for switch management and test orchestration.
- Provided senior-level technical guidance in the network validation lab — the go-to resource for complex reproduction environments.

### Validation Engineer

#### Kelly Services at Intel | Hillsboro, Oregon

{{< date >}}Aug 2021 – Jun 2022{{< /date >}}

- Built customer issue-reproduction environments for Linux and Windows networking stacks. Authored automation for validation and data collection that became team-standard tooling.

### Developer & Technical Support Engineer

#### Bertram Communications | Random Lake, Wisconsin

{{< date >}}Nov 2019 – Mar 2021{{< /date >}}

- Developed features for **Powercode**, an ISP management SaaS serving **300+ ISPs worldwide**. Sole engineer on **DHCP Option 82** relay support and **RADIUS authentication** integration, improving provisioning reliability across the customer base.
- Built internal test lab and knowledge base from scratch. Stack: PHP, MySQL, CentOS, Linux networking.

### Earlier Career

{{< date >}}2002 – 2019{{< /date >}}

- **Lakeshore Technical College** — IT Support (2019)
- **Central Oregon Internet** — Linux Sysadmin & Technical Support (2002–2003)
- Continuous self-directed work in open-source systems, Linux administration, networking, and automation throughout this period.

## Technical Skills

<dl class="skills-grid">
<dt>Platforms</dt><dd>Linux (Debian, Ubuntu, RHEL, Arch, Gentoo), BSD, Windows Server, VMware ESXi, Proxmox</dd>
<dt>Infrastructure</dt><dd>Kubernetes/K3s, Docker, Helm, FluxCD, Terraform, Ansible/AWX, Traefik, Nginx, Longhorn, JuiceFS, FOG</dd>
<dt>Cloud</dt><dd>AWS (S3, Lambda, API Gateway, CloudFront, Route 53), hybrid cloud architecture</dd>
<dt>Networking</dt><dd>WireGuard, VLANs, DHCP/Kea, BIND/DNS, PXE/iPXE, 100G+ fiber, switch automation, RADIUS</dd>
<dt>Languages</dt><dd>Python, Bash, JavaScript/React, PHP, Go, Rust, Lua</dd>
<dt>Data &amp; Apps</dt><dd>Django, PostgreSQL, Redis, Celery, REST APIs, Grafana, PowerBI, SAP, LLM integration (OpenAI, Anthropic, Ollama)</dd>
<dt>Supply Chain</dt><dd>Coverity, Klocwork, Black Duck Binary Analysis, SBOM, open-source license compliance (SWLC)</dd>
<dt>Build Systems</dt><dd>Release engineering, cross-compilation, automated &amp; deterministic builds</dd>
<dt>Methods</dt><dd>AI-augmented development, system design, GitOps, CI/CD (GitHub Actions, Jenkins), Power Automate, technical writing</dd>
</dl>

## Education & Certifications

**Lakeshore Technical College** — IT Networking coursework &ensp;|&ensp; CompTIA A+ &ensp;|&ensp; AWS Certified Cloud Practitioner
