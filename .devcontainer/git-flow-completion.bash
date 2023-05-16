#!/usr/bin/env bash

_git_flow ()
{
	local subcommands="init feature release hotfix support help version"
	local subcommand
  subcommand="$(__git_find_on_cmdline "$subcommands")"
	if [ -z "$subcommand" ]; then
		__gitcomp "$subcommands"
		return
	fi

	case "$subcommand" in
	init)
		__git_flow_init
		return
		;;
	feature)
		__git_flow_feature
		return
		;;
	release)
		__git_flow_release
		return
		;;
	hotfix)
		__git_flow_hotfix
		return
		;;
	support)
		__git_flow_support
		return
		;;
	*)
		COMPREPLY=()
		;;
	esac
}

__git_flow_init ()
{
	local subcommands="help"
	local subcommand
  subcommand="$(__git_find_on_cmdline "$subcommands")"
	if [ -z "$subcommand" ]; then
		__gitcomp "$subcommands"
		return
	fi
}

__git_flow_feature ()
{
	local subcommands="list start finish publish track diff rebase checkout pull help"
	local subcommand
  subcommand="$(__git_find_on_cmdline "$subcommands")"
	if [ -z "$subcommand" ]; then
		__gitcomp "$subcommands"
		return
	fi

	case "$subcommand" in
	pull)
		__gitcomp "$(__git_remotes)"
		return
		;;
	checkout|finish|diff|rebase)
		__gitcomp "$(__git_flow_list_branches 'feature')"
		return
		;;
	publish)
		__gitcomp "$(comm -23 <(__git_flow_list_branches 'feature') <(__git_flow_list_remote_branches 'feature'))"
		return
		;;
	track)
		__gitcomp "$(comm -23 <(__git_flow_list_remote_branches 'feature') <(__git_flow_list_branches 'feature'))"
		return
		;;
	*)
		COMPREPLY=()
		;;
	esac
}

__git_flow_release ()
{
	local subcommands="list start finish track publish help"
	local subcommand
  subcommand="$(__git_find_on_cmdline "$subcommands")"
	if [ -z "$subcommand" ]; then
		__gitcomp "$subcommands"
		return
	fi

	case "$subcommand" in
	finish)
		__gitcomp "$(__git_flow_list_branches 'release')"
		return
		;;
	publish)
		__gitcomp "$(comm -23 <(__git_flow_list_branches 'release') <(__git_flow_list_remote_branches 'release'))"
		return
		;;
	track)
		__gitcomp "$(comm -23 <(__git_flow_list_remote_branches 'release') <(__git_flow_list_branches 'release'))"
		return
		;;
	*)
		COMPREPLY=()
		;;
	esac

}

__git_flow_hotfix ()
{
	local subcommands="list start finish track publish help"
	local subcommand
  subcommand="$(__git_find_on_cmdline "$subcommands")"
	if [ -z "$subcommand" ]; then
		__gitcomp "$subcommands"
		return
	fi

	case "$subcommand" in
	finish)
		__gitcomp "$(__git_flow_list_branches 'hotfix')"
		return
		;;
	publish)
		__gitcomp "$(comm -23 <(__git_flow_list_branches 'hotfix') <(__git_flow_list_remote_branches 'hotfix'))"
		return
		;;
	track)
		__gitcomp "$(comm -23 <(__git_flow_list_remote_branches 'hotfix') <(__git_flow_list_branches 'hotfix'))"
		return
		;;
	*)
		COMPREPLY=()
		;;
	esac
}

__git_flow_support ()
{
	local subcommands="list start help"
	local subcommand
  subcommand="$(__git_find_on_cmdline "$subcommands")"
	if [ -z "$subcommand" ]; then
		__gitcomp "$subcommands"
		return
	fi

	case "$subcommand" in
	*)
		COMPREPLY=()
		;;
	esac
}

__git_flow_prefix ()
{
	case "$1" in
	feature|release|hotfix)
		git config "gitflow.prefix.$1" 2> /dev/null || echo "$1/"
		return
		;;
	esac
}

__git_flow_list_branches ()
{
	local prefix
  prefix="$(__git_flow_prefix "$1")"
	git branch --no-color 2> /dev/null | tr -d ' |*' | grep --color=never "^$prefix" | sed s,^"$prefix",, | sort
}

__git_flow_list_remote_branches ()
{
	local prefix
  prefix="$(__git_flow_prefix "$1")"
	local origin
  origin="$(git config gitflow.origin 2> /dev/null || echo "origin")"
	git branch --no-color -r 2> /dev/null | sed "s/^ *//g" | grep --color=never "^$origin/$prefix" | sed s,^"$origin"/"$prefix",, | sort
}

# alias __git_find_on_cmdline for backwards compatibility
if [ -z "$(type -t __git_find_on_cmdline)" ]; then
	alias __git_find_on_cmdline=__git_find_subcommand
fi