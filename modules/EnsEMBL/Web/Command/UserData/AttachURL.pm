package EnsEMBL::Web::Command::UserData::AttachURL;

use strict;
use warnings;

use Class::Std;

use EnsEMBL::Web::RegObj;
use EnsEMBL::Web::Tools::Misc;
use base 'EnsEMBL::Web::Command';

{

sub process {
  my $self = shift;
  my $object = $self->object;
  my $redirect = '/'.$object->data_species.'/UserData/';
  my $param = {
    '_referer'          => $object->param('_referer'),
    'x_requested_with'  => $object->param('x_requested_with'),
  };

  my $name = $object->param('name');
  unless ($name) {
    my @path = split('/', $object->param('url'));
    $name = $path[-1];
  }

  if (my $url = $object->param('url')) {
    $url = 'http://'.$url unless $url =~ /^http/;

    ## Check file size
    my $filesize = EnsEMBL::Web::Tools::Misc::get_url_filesize($url);
    if ($filesize < 0) {
      $redirect .= 'SelectURL';
      $param->{'filter_module'} = 'Data';
      $param->{'filter_code'} = 'no_response';
    }
    elsif ($filesize < 1) {
      $redirect .= 'SelectURL';
      $param->{'filter_module'} = 'Data';
      $param->{'filter_code'} = 'empty';
    }
    else {
      my $data = $object->get_session->add_data(
        type      => 'url',
        url       => $url,
        name      => $name,
        species   => $object->data_species,
        filesize  => $filesize,
      );
      if ($object->param('save')) {
        $object->move_to_user('type'=>'url', 'code'=>$data->{'code'});
      }
      $redirect .= 'UrlFeedback';
    }
  } else {
    $redirect .= 'SelectURL';
    $param->{'filter_module'} = 'Data';
    $param->{'filter_code'} = 'no_url';
  }

  if ($object->param('x_requested_with')) {
    $self->ajax_redirect($redirect, $param); 
  }
  else {
    $object->redirect($redirect, $param);
  }
}

}

1;
