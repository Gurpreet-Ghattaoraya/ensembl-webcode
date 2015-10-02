=head1 LICENSE

Copyright [1999-2015] Wellcome Trust Sanger Institute and the EMBL-European Bioinformatics Institute

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

=cut

package EnsEMBL::Web::NewTable::Callback;

use strict;
use warnings;

use parent qw(EnsEMBL::Web::NewTable::Endpoint);

use JSON qw(from_json);

use CGI::Cookie;
use MIME::Base64;
use Compress::Zlib;
use Digest::MD5 qw(md5_hex);
use SiteDefs;
use Text::CSV;

use EnsEMBL::Web::Procedure;

# XXX move all this stuff to somewhere it's more suited

sub compress_block {
  return encode_base64(compress(JSON->new->encode($_[0])));
}

sub uncompress_block {
  return JSON->new->decode(uncompress(decode_base64($_[0])));
}

sub new {
  my ($proto,$hub,$component) = @_;

  my $class = ref($proto) || $proto;
  my $self = $class->SUPER::new($hub,$component);
  $self = { %$self, (
    hub => $hub,
    component => $component,
    outdata => [],
    enum_values => {},
    sort_data => [],
    null_cache => [],
    data => [],
    nulls => [],
    outnulls => [],
    shadow_num => 0,
    reqeust_num => 0,
    generator_num => 0,
    len => 0,
    outlen => [],
    stand_down => 0,
  )};
  bless $self,$class;
  return $self;
}

sub add_enum {
  my ($self,$row) = @_;

  foreach my $colkey (@{$self->{'wire'}{'enumerate'}||[]}) {
    my $column = $self->{'columns'}{$colkey};
    my $values = ($self->{'enum_values'}{$colkey}||={});
    my $value = $row->{$colkey};
    $column->add_value($values,$value);
  }
}

sub finish_enum {
  my ($self,$row) = @_;

  my %enums;
  foreach my $colkey (@{$self->{'wire'}{'enumerate'}||[]}) {
    my $column = $self->{'columns'}{$colkey};
    $enums{$colkey} = $column->range($self->{'enum_values'}{$colkey}||{});
  }
  return \%enums;
}

sub consolidate {
  my ($self) = @_;
  push @{$self->{'outdata'}},compress_block($self->{'data'});
  push @{$self->{'outnulls'}},compress_block($self->{'nulls'});
  push @{$self->{'outlen'}},$self->{'len'};
  $self->{'data'} = [];
  $self->{'nulls'} = [];
  $self->{'len'} = 0;
}

sub add_row {
  my ($self,$row) = @_;

  my $rows = $self->{'orient'}{'pagerows'};
  $self->{'stand_down'} = 1 if $rows && $self->{'shadow_num'} >= $rows->[1];
  $self->{'shadow_num'}++;
  return 0 unless $self->passes_muster($row); 
  $self->{'request_num'}++;
  $self->add_enum($row); 
  if($self->{'wire'}{'sort'} and @{$self->{'wire'}{'sort'}}) {
    $self->server_sortdata($row,$self->{'wire'}{'sort'},$self->{'used_cols'});
  }
  my $nulls = $self->server_nulls($row,$self->{'iconfig'},$self->{'used_cols'});
  foreach my $i (0..$#{$self->{'used_cols'}}) {
    my $k = $self->{'used_cols'}[$i];
    $self->{'data'}[$i]||=[];
    push @{$self->{'nulls'}[$i]||=[]},$nulls->{$k};
    push @{$self->{'data'}[$i]||=[]},$row->{$k} unless $nulls->{$k};
  }
  $self->{'len'}++;
  $self->consolidate() unless $self->{'len'}%10000;
  return 1;
}

sub go {
  my ($self) = @_;

  my $hub = $self->{'hub'};
  $self->{'iconfig'} = from_json($hub->param('config'));
  $self->{'orient'} = from_json($hub->param('orient'));
  $self->{'wire'} = from_json($hub->param('wire'));
  my $more = JSON->new->allow_nonref->decode($hub->param('more'));
  my $incr_ok = ($hub->param('incr_ok')||'' eq 'true');
  my $keymeta = from_json($hub->param('keymeta'));
  # Add plugins
  my $ssplugins = from_json($hub->param('ssplugins'));
  foreach my $name (keys %$ssplugins) {
    $name =~ s/\W//g;
    $self->add_plugin($name,$ssplugins->{$name});
  } 
  # Add columns
  $self->{'columns'} = {};
  foreach my $key (keys %{$self->{'iconfig'}{'colconf'}}) {
    my $cc = $self->{'iconfig'}{'colconf'}{$key};
    $self->{'columns'}{$key} =
      EnsEMBL::Web::NewTable::Column->new($self,$cc->{'sstype'},$key,$cc->{'ssconf'},$cc->{'ssarg'});
  }

  my $proc = EnsEMBL::Web::Procedure->new($self->{'hub'},'callback');

  $proc->set_variables({
    orient => $self->{'orient'}, more => $more, incr_ok => $incr_ok,
    keymeta => $keymeta
  });
  my $out = $proc->go(sub {
    return $self->newtable_data_request($more,$incr_ok,$keymeta);
  });
  if($self->{'wire'}{'format'} eq 'export') {
    $out = convert_to_csv($self->{'iconfig'},$out);
    my $r = $hub->apache_handle;
    # TODO find bits of ensembl which can do this as we do
    $r->content_type('application/octet-string');
    my $cookie = CGI::Cookie->new(-name  => 'spawntoken',
                                  -value => $hub->param('spawntoken'));
    $r->headers_out->add('Set-Cookie' => $cookie);
    $r->headers_out->add('Content-Disposition' => sprintf 'attachment; filename=%s.csv', $hub->param('filename')||'ensembl-export');
  }
  return $out;
}

sub preload {
  my ($self,$table,$config,$orient) = @_;

  $self->{'iconfig'} = $config;
  $self->{'wire'} = $orient;
  $self->{'orient'} = $orient;
  $self->{'columns'} = $table->columns;
  my $proc = EnsEMBL::Web::Procedure->new($self->{'hub'},'preload');
  $proc->set_variables({ orient => $self->{'orient'}, config => $config });
  return $proc->go(sub {
    return $self->newtable_data_request(undef,1);
  }); 
}

sub server_sortdata {
  my ($self,$row,$sort,$series) = @_;

  my $colconf = $self->{'iconfig'}{'colconf'};
  foreach my $i (0..$#$sort) {
    push @{$self->{'sort_data'}[$i]||=[]},$row->{$sort->[$i]{'key'}};
  }
  push @{$self->{'sort_data'}[@$sort]||=[]},$self->{'shadow_num'}-1;
}

sub server_order {
  my ($self,$sort,$series,$keymeta) = @_;

  my @cache;
  my %rseries;
  $rseries{$series->[$_]} = $_ for (0..$#$series);
  $rseries{'__tie'} = -1;
  my @columns = map { $self->{'columns'}{$_->{'key'}} } @$sort;
  push @columns,EnsEMBL::Web::NewTable::Column->new($self,'numeric','__tie');
  my $sd = $self->{'sort_data'};
  my @order = sort {
    my $c = 0;
    foreach my $i (0..@$sort) {
      $cache[$i]||={};
      $c = $columns[$i]->compare($sd->[$i][$a],$sd->[$i][$b],
                                 $sort->[$i]{'dir'}||1,$keymeta,$cache[$i],
                                 $sort->[$i]{'key'}||'__tie');
      last if $c;
    }
    $c;
  } (0..$#{$sd->[0]});
  return \@order;
}

sub server_nulls {
  my ($self,$row,$iconfig,$series) = @_;

  my %nulls;
  foreach my $j (0..$#$series) {
    my $col = $self->{'columns'}{$series->[$j]};
    my $null_cache = ($self->{'null_cache'}[$j]||={});
    my $v = $row->{$series->[$j]};
    my $is_null = (!defined $v);
    $is_null = $null_cache->{$v} unless $is_null;
    unless(defined $is_null) {
      $is_null = $col->is_null($v);
      $null_cache->{$v} = $is_null;
    }
    $nulls{$series->[$j]} = 0+$is_null;
  }
  return \%nulls;
}

sub stand_down {
  my ($self) = @_;

  return 0 if $self->size_needed;
  return $self->{'stand_down'};
}

sub free_wheel {
  my ($self,$acct) = @_;

  if($self->{'stand_down'}) {
    $self->{'shadow_num'}++;
    return 1;
  }
  return 0; 
}

sub passes_muster {
  my ($self,$row) = @_;

  my $rows = $self->{'orient'}{'pagerows'};
  if($rows) {
    my $global_num = $self->{'shadow_num'}-1;
    return 0 if $global_num < $rows->[0] or $global_num >= $rows->[1];
  }
  my $ok = 1;
  foreach my $col (keys %{$self->{'wire'}{'filter'}||{}}) {
    my $colconf = $self->{'iconfig'}{'colconf'}{$col};
    my $column = $self->{'columns'}->{$col};
    next unless exists $row->{$col};
    my $val = $row->{$col};
    my $ok_col = 0;
    my $values = $column->split($val);
    foreach my $value (@{$values||[]}) {
      my $fv = $self->{'wire'}{'filter'}{$col};
      if($column->is_match($fv,$value)) {
        $ok_col = 1;
        last;
      }
    }
    unless($ok_col) { $ok = 0; last; }
  }
  return $ok;
}

sub register_key {
  my ($self,$key,$meta) = @_;

  $self->{'key_meta'}||={};
  $self->{'key_meta'}{$key}||={};
  foreach my $k (keys %{$meta||{}}) {
    $self->{'key_meta'}{$key}{$k} = $meta->{$k} unless exists $self->{'key_meta'}{$key}{$k};
  } 
}

sub convert_to_csv {
  my ($config,$data) = @_;

  my $csv = Text::CSV->new({ binary => 1 });
  my $out;
  my $series = $data->{'response'}{'series'};
  my %rseries;
  $rseries{$series->[$_]} = $_ for(0..$#$series);
  my @index;
  foreach my $key (@{$config->{'columns'}}) {
    push @index,$rseries{$key};
  }
  $csv->combine(@{$config->{'columns'}});
  $out .= $csv->string()."\n";
  foreach my $i (0..$#{$data->{'response'}{'nulls'}}) {
    my $rows = uncompress_block($data->{'response'}{'data'}[$i]);
    my $nulls = uncompress_block($data->{'response'}{'nulls'}[$i]);
    my $len = $data->{'response'}{'len'}[$i];
    my @idx;
    foreach my $row (0..$len-1) {
      my @row;
      foreach my $col (@index) {
        if($nulls->[$col][$row]) { push @row,''; }
        else { push @row,$rows->[$col][($idx[$col]||=0)++]; }
      }
      $csv->combine(@row);
      $out .= $csv->string()."\n";
    }
  }
  return $out;
}

sub phase { return $_[0]->{'phase_name'}; }

sub newtable_data_request {
  my ($self,$more,$incr_ok,$keymeta) = @_;

  my @cols = @{$self->{'iconfig'}{'columns'}};
  my %cols_pos;
  $cols_pos{$cols[$_]} = $_ for(0..$#cols);
  $self->{'cols_pos'} = \%cols_pos;

  my $phases = $self->{'iconfig'}{'phases'};
  $phases = [{ name => undef }] unless $phases and @$phases;
  my @out;

  # Check if we need to request all rows due to sorting
  my $all_data = 0;
  if($self->{'wire'}{'sort'} and @{$self->{'wire'}{'sort'}}) {
    $all_data = 1;
  }

  my $phase = 0;
  my (%req_lengths,%shadow_lengths);
  if(defined $more) {
    $phase = $more->{'phase'};
    %req_lengths = %{$more->{'req_lengths'}};
    %shadow_lengths = %{$more->{'shadow_lengths'}};
  }
  # What phase should we be?
  my @required;
  push @required,map { $_->{'key'} } @{$self->{'wire'}{'sort'}||[]};
  if($incr_ok && !$all_data) {
    while(($phase||0) < $#$phases) {
      my %gets_cols = map { $_ => 1 } (@{$phases->[$phase]{'cols'}||\@cols});
      last unless scalar(grep { !$gets_cols{$_} } @required);
      $phase++;
    }
  } else {
    die "XXX Fix before merging\n";
    $phase = $#$phases;
  }
  $self->{'phase_name'} = $phases->[$phase]{'name'};
  warn "CHOSEN PHASE $self->{'phase_name'}\n";
  $self->{'start'} = ($req_lengths{$phases->[$phase]{'era'}}||=0);
  $self->{'shadow_num'} = ($shadow_lengths{$phases->[$phase]{'era'}}||=0);

  # Calculate columns to send
  $self->{'used_cols'} = $phases->[$phase]{'cols'} || \@cols;

  # Calculate function name
  my $type = $self->{'iconfig'}{'type'}||'';
  $type =~ s/\W//g;
  my $func = "table_content";
  $func .= "_$type" if $type;

  # Populate data
  $self->{'component'}->$func($self);

  my %shadow = %{$self->{'orient'}};
  delete $shadow{'filter'};
  $shadow{'series'} = $self->{'used_cols'};

  # Sort it, if necessary
  my $order;
  if($self->{'wire'}{'sort'} and @{$self->{'wire'}{'sort'}}) {
    $order = $self->server_order($self->{'wire'}{'sort'},$self->{'used_cols'},$keymeta);
  }

  # Send it
  $self->consolidate();
  # Move on continuation counters
  $req_lengths{$phases->[$phase]{'era'}} = $self->{'request_num'};
  $shadow_lengths{$phases->[$phase]{'era'}} = $self->{'shadow_num'};
  $phase++;
  $more = { phase => $phase, req_lengths => \%req_lengths, shadow_lengths => \%shadow_lengths };
  $more= undef if $phase == @$phases;
  my $out = {
    responses => [{
      len => $self->{'outlen'},
      data => $self->{'outdata'},
      nulls => $self->{'outnulls'},
      series => $self->{'used_cols'},
      order => $order,
      start => $self->{'start'},
      more => $more,
      enums => $self->finish_enum(),
      shadow => \%shadow,
      minsize => $self->{'shadow_num'},
      keymeta => $self->{'key_meta'},
      orient => $self->{'orient'},
    }],
  };
  return $out;
}

1;
